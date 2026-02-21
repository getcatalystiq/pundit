-- Pundit Database Schema
-- Neon PostgreSQL with pgvector extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-------------------------------------------------------------------------------
-- TENANTS (Organizations)
-------------------------------------------------------------------------------
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR(255) NOT NULL UNIQUE,
    client_secret_hash VARCHAR(255),
    client_name VARCHAR(255) NOT NULL,
    client_uri VARCHAR(500),
    redirect_uris TEXT[] NOT NULL,
    grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
    response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
    token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'client_secret_basic',
    scope TEXT NOT NULL DEFAULT 'read write',
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);

-------------------------------------------------------------------------------
-- OAUTH AUTHORIZATION CODES
-------------------------------------------------------------------------------
CREATE TABLE oauth_authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri VARCHAR(500) NOT NULL,
    scope TEXT NOT NULL,
    code_challenge VARCHAR(255),
    code_challenge_method VARCHAR(10),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

CREATE INDEX idx_oauth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);

-------------------------------------------------------------------------------
-- OAUTH REFRESH TOKENS
-------------------------------------------------------------------------------
CREATE TABLE oauth_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
-- TENANT DATABASES (Database connections)
-------------------------------------------------------------------------------
CREATE TABLE tenant_databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    host VARCHAR(500) NOT NULL,
    port INTEGER NOT NULL DEFAULT 5432,
    database_name VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    encrypted_password BYTEA NOT NULL,
    encryption_iv BYTEA NOT NULL,
    encryption_tag BYTEA NOT NULL,
    encryption_key_version INTEGER NOT NULL DEFAULT 1,
    ssl_mode VARCHAR(50) NOT NULL DEFAULT 'require',
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
-- DB_DDL (Schema definitions)
-------------------------------------------------------------------------------
CREATE TABLE db_ddl (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    ddl TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_ddl_tenant_db ON db_ddl(tenant_id, database_id);
CREATE INDEX idx_db_ddl_embedding ON db_ddl
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-------------------------------------------------------------------------------
-- DB_DOCUMENTATION (Business context)
-------------------------------------------------------------------------------
CREATE TABLE db_documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    documentation TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_documentation_tenant_db ON db_documentation(tenant_id, database_id);
CREATE INDEX idx_db_documentation_embedding ON db_documentation
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-------------------------------------------------------------------------------
-- DB_QUESTION_SQL (Few-shot examples)
-------------------------------------------------------------------------------
CREATE TABLE db_question_sql (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    sql TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_question_sql_tenant_db ON db_question_sql(tenant_id, database_id);
CREATE INDEX idx_db_question_sql_embedding ON db_question_sql
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-------------------------------------------------------------------------------
-- DB_TOOL_MEMORY (Past successful queries)
-------------------------------------------------------------------------------
CREATE TABLE db_tool_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    tool_args JSONB NOT NULL,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_tool_memory_tenant_db ON db_tool_memory(tenant_id, database_id);
CREATE INDEX idx_db_tool_memory_embedding ON db_tool_memory
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-------------------------------------------------------------------------------
-- DB_TEXT_MEMORY (Free-form domain knowledge)
-------------------------------------------------------------------------------
CREATE TABLE db_text_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_db_text_memory_tenant_db ON db_text_memory(tenant_id, database_id);
CREATE INDEX idx_db_text_memory_embedding ON db_text_memory
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-------------------------------------------------------------------------------
-- QUERY AUDIT LOG
-------------------------------------------------------------------------------
CREATE TABLE query_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES tenant_databases(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sql_text TEXT NOT NULL,
    row_count INTEGER,
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_query_audit_log_tenant ON query_audit_log(tenant_id);
CREATE INDEX idx_query_audit_log_database ON query_audit_log(database_id);
CREATE INDEX idx_query_audit_log_created ON query_audit_log(created_at);

-------------------------------------------------------------------------------
-- SIMILARITY SEARCH FUNCTIONS
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_db_ddl(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, ddl TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.ddl, 1 - (d.embedding <=> query_embedding) AS similarity
    FROM db_ddl d
    WHERE d.tenant_id = match_tenant_id
      AND d.database_id = match_database_id
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_db_documentation(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, documentation TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.documentation, 1 - (d.embedding <=> query_embedding) AS similarity
    FROM db_documentation d
    WHERE d.tenant_id = match_tenant_id
      AND d.database_id = match_database_id
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_db_question_sql(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, question TEXT, sql TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT qs.id, qs.question, qs.sql, 1 - (qs.embedding <=> query_embedding) AS similarity
    FROM db_question_sql qs
    WHERE qs.tenant_id = match_tenant_id
      AND qs.database_id = match_database_id
    ORDER BY qs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_db_tool_memory(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 3,
    similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (id UUID, question TEXT, tool_name VARCHAR, tool_args JSONB, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT tm.id, tm.question, tm.tool_name, tm.tool_args,
           1 - (tm.embedding <=> query_embedding) AS similarity
    FROM db_tool_memory tm
    WHERE tm.tenant_id = match_tenant_id
      AND tm.database_id = match_database_id
      AND tm.success = TRUE
      AND (1 - (tm.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY tm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_db_text_memory(
    query_embedding vector(1536),
    match_tenant_id UUID,
    match_database_id UUID,
    match_count INT DEFAULT 3,
    similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (id UUID, content TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT tm.id, tm.content, 1 - (tm.embedding <=> query_embedding) AS similarity
    FROM db_text_memory tm
    WHERE tm.tenant_id = match_tenant_id
      AND tm.database_id = match_database_id
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
$$ LANGUAGE plpgsql;

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
