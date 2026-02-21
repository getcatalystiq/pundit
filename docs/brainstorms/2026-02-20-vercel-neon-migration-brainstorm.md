---
date: 2026-02-20
topic: vercel-neon-migration
---

# Pundit: AWS to Vercel + Neon Migration

## What We're Building

A full rewrite of Pundit from Python/Lambda/Aurora to TypeScript/Next.js/Neon, following the same architecture patterns established in Herald. The result is a unified Next.js 16 app (App Router) deployed on Vercel with Neon PostgreSQL (pgvector) as the database.

Pundit is an MCP server that lets AI agents query tenant databases using RAG-powered SQL generation. The rewrite preserves all core functionality: OAuth 2.1 authentication, MCP protocol, RAG training system (5 data types), SQL generation and execution, chart visualization, and an admin dashboard.

## Why This Approach

**Clean slate rewrite** chosen over incremental migration or Herald scaffolding because:
- Pundit's Python backend has no reusable code for a TypeScript target
- Starting fresh avoids carrying over Aurora Data API patterns that don't apply to Neon
- Herald's patterns can be referenced without forking (copy patterns, not code)
- No live tenants requiring parallel operation during migration

## Key Decisions

- **Language:** Full TypeScript/Next.js 16 rewrite (not Python on Vercel or hybrid)
- **Database:** Neon PostgreSQL with pgvector extension for RAG vectors
- **Tenant DB support:** PostgreSQL only (drop MySQL, Snowflake, BigQuery, SQLite support initially)
- **AI services:** Vercel AI Gateway for both Claude (SQL generation) and embeddings
- **RAG system:** Full port of all 5 training data types (DDL, docs, examples, tool memory, text memory) with pgvector similarity search in Neon
- **Admin UI:** Unified Next.js app with App Router pages (not a separate React SPA)
- **Visualization:** Vercel Blob for chart image storage (replacing S3 + CloudFront)
- **Secrets:** Tenant database credentials encrypted and stored in Neon (not external secrets manager)
- **Chart rendering:** Chart.js + chartjs-node-canvas for server-side PNG generation (replacing Python Altair/Vega-Lite)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions) via Vercel AI Gateway, same model as current Python version
- **Function timeout:** 60s (Vercel Pro) is sufficient
- **Deployment:** Vercel with Neon, same as Herald

## Architecture Mapping

### AWS to Vercel Service Map

| AWS Service | Vercel/Neon Replacement |
|---|---|
| Lambda (Python 3.12) | Next.js API Routes (TypeScript) |
| Aurora Serverless v2 (PostgreSQL 16) | Neon PostgreSQL (with pgvector) |
| API Gateway (HTTP) | Vercel Edge Network |
| S3 (charts) | Vercel Blob |
| CloudFront (admin UI + charts CDN) | Vercel Edge Network |
| Secrets Manager | Encrypted columns in Neon |
| SAM/CloudFormation | vercel.json + Neon dashboard |
| Bedrock (Claude) | Vercel AI Gateway (Anthropic) |
| VPC + NAT Gateway | Not needed (serverless) |

### Python to TypeScript Module Map

| Python Module | TypeScript Equivalent |
|---|---|
| `src/oauth/` | `lib/oauth.ts` (reuse Herald's pattern) |
| `src/mcp/server.py` | `app/mcp/route.ts` + `app/api/mcp/route.ts` |
| `src/tools/*.py` | `lib/mcp-tools.ts` |
| `src/db/aurora.py` | `lib/db.ts` (Neon proxy pattern from Herald) |
| `src/db/connections.py` | `lib/tenant-db.ts` (direct pg connections) |
| `src/db/embeddings.py` | `lib/embeddings.ts` (via Vercel AI Gateway) |
| `src/db/memory.py` | `lib/rag.ts` (pgvector queries) |
| `src/ai/generator.py` | `lib/sql-generator.ts` (via Vercel AI Gateway) |
| `src/ai/schema.py` | `lib/schema-analyzer.ts` |
| `src/admin/tenant.py` | `app/api/admin/` routes |
| `src/admin/platform.py` | `app/api/admin/` routes (merged) |
| `admin-ui/` | `app/(admin)/` pages |
| `migrations/` | `migrations/` (adapted for Neon) |

### MCP Tools to Port

| Tool | Scope | Description |
|---|---|---|
| `search_database_context` | read | RAG search across DDL, docs, examples, memories |
| `generate_sql` | read | Natural language to SQL via Claude |
| `execute_sql` | write | Execute SELECT queries on tenant DBs |
| `visualize_results` | read | Generate chart PNGs from query results |
| `save_sql_pattern` | write | Save query to RAG training data |
| `list_databases` | read | List tenant's connected databases |

### Database Schema

Port the existing schema from `migrations/001_initial_schema.sql` to Neon, keeping:
- All tables (tenants, users, oauth_*, mcp_sessions, tenant_databases, RAG tables)
- pgvector extension with 1536-dimension embeddings
- IVFFlat indexes on embedding columns
- Similarity search functions (match_db_ddl, match_db_documentation, etc.)
- Multi-tenant isolation (tenant_id on every table)

Key adaptation: Replace Aurora Data API parameter style with Neon tagged template literals.

### Tenant Database Credentials

Store encrypted in `tenant_databases` table:
- `connection_string_encrypted` column (AES-256-GCM)
- Encryption key from `JWT_SECRET` or a dedicated `ENCRYPTION_KEY` env var
- Decrypt at query time, connect via `pg` or `@neondatabase/serverless`

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `NEXT_PUBLIC_URL` | Public app URL |
| `ENCRYPTION_KEY` | Key for encrypting tenant DB credentials |
| `CRON_SECRET` | Vercel cron authentication |

Vercel AI Gateway configuration handled through Vercel dashboard.

## Resolved Questions

- **Vercel function timeout:** 60s (Vercel Pro) is sufficient. Optimize slow queries rather than extending timeouts.
- **pgvector on Neon:** Neon supports pgvector with IVFFlat indexes. Keep 1536-dim vectors with OpenAI text-embedding-3-small via Vercel AI Gateway.
- **Chart rendering:** Use Chart.js + chartjs-node-canvas for server-side PNG generation. Replaces Python's Altair/Vega-Lite.

## Next Steps

-> `/workflows:plan` for implementation details
