# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pundit is a hosted MCP (Model Context Protocol) Server for database tools. It provides AI-powered database querying through OAuth 2.1 authentication and RAG (Retrieval-Augmented Generation) for semantic SQL generation.

## Architecture

```
API Gateway (HTTP) → Lambda Functions → Aurora PostgreSQL (pgvector)

Endpoints:
  /.well-known/oauth-authorization-server, /oauth/*, /signup, /login → OAuth Lambda
  /mcp → MCP Lambda (7 database tools)
  /admin/* → Tenant Admin Lambda (OAuth auth)
  /tenants/* → Platform Admin Lambda (IAM auth)

Storage: Aurora Serverless v2, S3 (Admin UI), CloudFront (CDN)
```

**Key directories:**
- `src/` - Python Lambda handlers and modules
- `src/oauth/` - OAuth 2.1 implementation (DCR, PKCE, JWT tokens)
- `src/mcp/` - MCP protocol with Streamable HTTP transport
- `src/tools/` - 7 MCP tools (search, generate, execute, visualize, save, list_db, context)
- `src/db/` - Aurora Data API, tenant database connections, embeddings
- `layers/` - Lambda layers (dependencies + altair/vl-convert for chart rendering)
- `migrations/` - PostgreSQL schema with pgvector for RAG
- `admin-ui/` - React 19 + Vite 6 + TypeScript frontend

## Commands

### Deploy
```bash
./scripts/deploy.sh dev      # Deploy to dev
./scripts/deploy.sh staging  # Deploy to staging
./scripts/deploy.sh prod     # Deploy to prod
```

### Local Development
```bash
./scripts/local-dev.sh       # Start PostgreSQL + SAM Local API + Vite UI
./scripts/local-dev.sh --db  # PostgreSQL only
./scripts/local-dev.sh --api # SAM Local API only (port 3000)
./scripts/local-dev.sh --ui  # Admin UI only (port 5173)
./scripts/local-dev.sh --stop
```

### Database
```bash
./scripts/migrate.sh         # Run migrations
./scripts/db-tunnel.sh       # SSM tunnel to Aurora via Bastion
```

### Admin UI
```bash
cd admin-ui
npm run dev                  # Vite dev server
npm run build                # Production build
npm run deploy               # Deploy to CloudFront/S3
```

### SAM Commands
```bash
sam build --use-container --parallel --cached
sam local start-api --port 3000 --env-vars /tmp/pundit-sam-env.json
sam local invoke McpFunction -e events/mcp-tools-list.json
```

## Key Files

- `template.yaml` - AWS SAM infrastructure (Lambda, API Gateway, Aurora, VPC)
- `samconfig.toml` - SAM CLI configuration per environment
- `src/mcp/server.py` - MCP handler, session management, tool routing
- `src/oauth/server.py` - OAuth 2.1 endpoints
- `src/tools/__init__.py` - Tool registry and JSON schemas
- `migrations/001_initial_schema.sql` - Database schema with pgvector RAG tables

## Environment Variables

- `AURORA_SECRET_ARN`, `AURORA_CLUSTER_ARN`, `AURORA_DATABASE` - Aurora config
- `OAUTH_ISSUER` - API Gateway URL for OAuth
- `JWT_SECRET` - JWT signing secret
- `OPENAI_SECRET_ARN` - OpenAI API key (Secrets Manager)
- `BEDROCK_REGION`, `BEDROCK_MODEL_ID` - Claude via Bedrock

## MCP Tools

1. `search_database_context` - RAG search over schemas/docs/examples
2. `generate_sql` - Natural language to SQL using RAG context
3. `execute_sql` - Execute SELECT queries (max 100 rows)
4. `visualize_data` - Altair charts rendered to PNG via vl-convert
5. `save_sql_pattern` - Save question→SQL pairs for RAG training
6. `save_business_context` - Save domain knowledge
7. `list_databases` - List available tenant database connections

## Multi-tenant Design

- Tenants (organizations) have users with roles and settings
- Each tenant can configure multiple database connections (`tenant_databases`)
- RAG training data is per-tenant: `db_ddl`, `db_documentation`, `db_question_sql`
- OAuth clients and MCP sessions are tenant-scoped
