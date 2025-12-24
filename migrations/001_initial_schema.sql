-- Pundit Database Schema
-- Aurora PostgreSQL with pgvector extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-------------------------------------------------------------------------------
-- TENANTS (Organizations)
-------------------------------------------------------------------------------
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,  -- URL-friendly identifier
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_email ON tenants(email);

-------------------------------------------------------------------------------
-- USERS (Tenant members)
-------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'member',  -- owner, admin, member
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],  -- OAuth scopes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-------------------------------------------------------------------------------
-- OAUTH CLIENTS (Dynamic Client Registration)
-------------------------------------------------------------------------------
CREATE TABLE oauth_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) NOT NULL UNIQUE,
    client_secret_hash VARCHAR(255),  -- NULL for public clients
    client_name VARCHAR(255) NOT NULL,
    client_uri VARCHAR(500),
    redirect_uris TEXT[] NOT NULL,
    grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
    response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
    token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'client_secret_basic',
    scope TEXT NOT NULL DEFAULT 'read write',
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,  -- NULL for global clients
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);

-------------------------------------------------------------------------------
-- OAUTH AUTHORIZATION CODES
-------------------------------------------------------------------------------
CREATE TABLE oauth_authorization_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(255) NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri VARCHAR(500) NOT NULL,
    scope TEXT NOT NULL,
    code_challenge VARCHAR(255),  -- PKCE
    code_challenge_method VARCHAR(10),  -- S256 or plain
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ  -- NULL until used
);

CREATE INDEX idx_oauth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);

-------------------------------------------------------------------------------
-- OAUTH REFRESH TOKENS
-------------------------------------------------------------------------------
CREATE TABLE oauth_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_oauth_refresh_tokens_hash ON oauth_refresh_tokens(token_hash);
CREATE INDEX idx_oauth_refresh_tokens_user ON oauth_refresh_tokens(user_id);

-------------------------------------------------------------------------------
-- MCP SESSIONS (Streamable HTTP session tracking)
-------------------------------------------------------------------------------
CREATE TABLE mcp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_info JSONB,
    capabilities JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_mcp_sessions_session_id ON mcp_sessions(session_id);
CREATE INDEX idx_mcp_sessions_user ON mcp_sessions(user_id);

-------------------------------------------------------------------------------
-- TENANT DATABASES (Database connections for tenants)
-------------------------------------------------------------------------------
CREATE TABLE tenant_databases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    db_type VARCHAR(50) NOT NULL,  -- postgresql, mysql, snowflake, bigquery, sqlite
    connection_config JSONB NOT NULL DEFAULT '{}',  -- host, port, database (non-sensitive)
    credentials_secret_arn VARCHAR(500),  -- AWS Secrets Manager ARN
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_tenant_databases_tenant ON tenant_databases(tenant_id);

-- Ensure only one default per tenant
CREATE UNIQUE INDEX idx_tenant_databases_default
    ON tenant_databases(tenant_id)
    WHERE is_default = TRUE;

-------------------------------------------------------------------------------
-- DB_DDL (Schema definitions - renamed from vanna_ddl)
-------------------------------------------------------------------------------
CREATE TABLE db_ddl (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    ddl TEXT NOT NULL,  -- CREATE TABLE statements
    embedding vector(1536),  -- OpenAI text-embedding-3-small (1536 dims)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_ddl_tenant ON db_ddl(tenant_id);
CREATE INDEX idx_db_ddl_database ON db_ddl(database_id);
CREATE INDEX idx_db_ddl_embedding ON db_ddl USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-------------------------------------------------------------------------------
-- DB_DOCUMENTATION (Business context - renamed from vanna_documentation)
-------------------------------------------------------------------------------
CREATE TABLE db_documentation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    documentation TEXT NOT NULL,  -- Column meanings, relationships, business rules
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_documentation_tenant ON db_documentation(tenant_id);
CREATE INDEX idx_db_documentation_database ON db_documentation(database_id);
CREATE INDEX idx_db_documentation_embedding ON db_documentation USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-------------------------------------------------------------------------------
-- DB_QUESTION_SQL (Few-shot examples - renamed from vanna_question_sql)
-------------------------------------------------------------------------------
CREATE TABLE db_question_sql (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    question TEXT NOT NULL,  -- Natural language question
    sql TEXT NOT NULL,  -- Corresponding SQL query
    embedding vector(1536),  -- Generated from question
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_question_sql_tenant ON db_question_sql(tenant_id);
CREATE INDEX idx_db_question_sql_database ON db_question_sql(database_id);
CREATE INDEX idx_db_question_sql_embedding ON db_question_sql USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-------------------------------------------------------------------------------
-- DB_TOOL_MEMORY (Past successful queries - renamed from vanna_tool_memory)
-------------------------------------------------------------------------------
CREATE TABLE db_tool_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    tool_name VARCHAR(100) NOT NULL,  -- e.g., "execute_sql"
    tool_args JSONB NOT NULL,  -- {sql: "..."}
    success BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB,  -- Optional extra context
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_tool_memory_tenant ON db_tool_memory(tenant_id);
CREATE INDEX idx_db_tool_memory_database ON db_tool_memory(database_id);
CREATE INDEX idx_db_tool_memory_embedding ON db_tool_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-------------------------------------------------------------------------------
-- DB_TEXT_MEMORY (Free-form domain knowledge - renamed from vanna_text_memory)
-------------------------------------------------------------------------------
CREATE TABLE db_text_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,  -- Domain knowledge, business rules
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_text_memory_tenant ON db_text_memory(tenant_id);
CREATE INDEX idx_db_text_memory_database ON db_text_memory(database_id);
CREATE INDEX idx_db_text_memory_embedding ON db_text_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-------------------------------------------------------------------------------
-- SIMILARITY SEARCH FUNCTIONS (Replaces Supabase RPC)
-------------------------------------------------------------------------------

-- Match DDL entries by similarity
CREATE OR REPLACE FUNCTION match_db_ddl(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    ddl TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.ddl,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM db_ddl d
    WHERE d.tenant_id = match_tenant_id
      AND d.database_id = match_database_id
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match documentation by similarity
CREATE OR REPLACE FUNCTION match_db_documentation(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    documentation TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.documentation,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM db_documentation d
    WHERE d.tenant_id = match_tenant_id
      AND d.database_id = match_database_id
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match question-SQL examples by similarity
CREATE OR REPLACE FUNCTION match_db_question_sql(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    question TEXT,
    sql TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        qs.id,
        qs.question,
        qs.sql,
        1 - (qs.embedding <=> query_embedding) AS similarity
    FROM db_question_sql qs
    WHERE qs.tenant_id = match_tenant_id
      AND qs.database_id = match_database_id
      AND qs.embedding IS NOT NULL
    ORDER BY qs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match tool memory by similarity with threshold
CREATE OR REPLACE FUNCTION match_db_tool_memory(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 3,
    similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    question TEXT,
    tool_name VARCHAR,
    tool_args JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tm.id,
        tm.question,
        tm.tool_name,
        tm.tool_args,
        1 - (tm.embedding <=> query_embedding) AS similarity
    FROM db_tool_memory tm
    WHERE tm.tenant_id = match_tenant_id
      AND tm.database_id = match_database_id
      AND tm.embedding IS NOT NULL
      AND tm.success = TRUE
      AND (1 - (tm.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY tm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match text memory by similarity with threshold
CREATE OR REPLACE FUNCTION match_db_text_memory(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 3,
    similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tm.id,
        tm.content,
        1 - (tm.embedding <=> query_embedding) AS similarity
    FROM db_text_memory tm
    WHERE tm.tenant_id = match_tenant_id
      AND tm.database_id = match_database_id
      AND tm.embedding IS NOT NULL
      AND (1 - (tm.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY tm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-------------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_databases_updated_at
    BEFORE UPDATE ON tenant_databases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_db_documentation_updated_at
    BEFORE UPDATE ON db_documentation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-------------------------------------------------------------------------------
-- SETTINGS (Key-value store for app config)
-------------------------------------------------------------------------------
CREATE TABLE settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
