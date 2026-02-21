# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pundit is a hosted MCP (Model Context Protocol) Server for AI-powered database querying. It provides RAG-based SQL generation, tenant database connections, and server-side chart rendering through OAuth 2.1 authentication.

## Architecture

```
Next.js 16 (App Router) → Vercel Serverless → Neon PostgreSQL (pgvector)

Endpoints:
  /.well-known/oauth-* → OAuth metadata
  /api/oauth/*         → OAuth 2.1 (DCR, PKCE S256, tokens)
  /api/signup, /api/login → Account creation / admin login
  /mcp                 → MCP server (7 database tools)
  /api/admin/*         → Admin dashboard API routes
  /dashboard, /databases, /users → Admin UI pages

AI Services: OpenAI (embeddings), Anthropic Claude (SQL generation, doc generation)
```

**Key directories:**
- `app/` — Next.js App Router: routes, layouts, pages
- `app/api/` — Server-side API routes (OAuth, admin, cron)
- `app/(admin)/` — Client-side admin UI pages
- `lib/` — Shared modules (OAuth, DB, RAG, crypto, MCP tools)
- `components/` — React components (admin layout, UI primitives)
- `migrations/` — PostgreSQL schema with pgvector
- `scripts/` — Migration runner

## Commands

### Build
```bash
npx next build --turbopack     # Always use Turbopack for production builds
```

### Development
```bash
npm run dev                    # Next.js dev server
npx tsx scripts/migrate.ts     # Run database migrations
```

### Deploy
```bash
npx vercel --prod              # Deploy to Vercel
```

## Key Constraints

### Turbopack Production Build
- `Response.json()` and `NextResponse.json()` FAIL silently in Turbopack production builds
- Always use `jsonResponse()` from `lib/utils.ts` instead
- Dev mode works fine with both — the issue is production-only

### Lazy Initialization
- Environment variables and secrets must NOT be validated at module level
- Use lazy getters (e.g., `getEnv()`, `getJwtSecret()`) because env vars aren't available at build time
- Module-level validation crashes `next build`

### Database
- Use `sql` tagged template from `lib/db.ts` for queries (Neon serverless)
- Use `getPool()` and `withTransaction()` for DDL and transactional operations
- Tenant database connections use `pg` library (NOT Neon — they're external PostgreSQL)

## Key Files

- `lib/db.ts` — Neon tagged template (lazy Proxy), Pool, withTransaction
- `lib/oauth.ts` — OAuth 2.1 with PKCE S256, transactional code/token exchange
- `lib/mcp-tools.ts` — 7 MCP tools with implementations
- `lib/rag.ts` — RAG search with CTE query, boosting, dynamic limits
- `lib/embeddings.ts` — OpenAI text-embedding-3-small via Vercel AI SDK
- `lib/sql-generator.ts` — Claude SQL generation via generateObject
- `lib/crypto.ts` — AES-256-GCM with HKDF key derivation and AAD
- `lib/tenant-db.ts` — External database connections (read-only enforcement)
- `lib/chart.ts` — chartjs-node-canvas PNG rendering
- `lib/admin-auth.ts` — Bearer token validation for admin routes
- `middleware.ts` — Security headers, CORS, MCP header exposure
- `migrations/001_schema.sql` — Full schema with pgvector HNSW indexes

## Environment Variables

- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET` — JWT signing (min 32 chars)
- `ENCRYPTION_KEY` — AES-256 master key (64 hex chars)
- `OPENAI_API_KEY` — Embeddings (text-embedding-3-small)
- `ANTHROPIC_API_KEY` — Claude (SQL gen, doc gen, analysis)
- `NEXT_PUBLIC_URL` — Application URL
- `CRON_SECRET` — Vercel cron authentication

## MCP Tools

1. `search_database_context` — RAG search with CTE query + table-mention boosting
2. `generate_sql` — Claude SQL generation via generateObject with Zod schemas
3. `execute_sql` — SELECT-only with LIMIT injection, audit logging, read-only enforcement
4. `visualize_data` — Server-side chart rendering to PNG
5. `save_sql_pattern` — Save Q&A pairs with near-duplicate detection (0.95 threshold)
6. `save_business_context` — Save domain knowledge with duplicate detection
7. `list_databases` — List tenant database connections

## Multi-tenant Design

- Tenants have users with roles (owner/admin/member) and scopes (read/write/admin)
- Each tenant configures database connections (`tenant_databases`) with encrypted credentials
- 5 RAG training data types per database: DDL, documentation, examples, tool memory, text memory
- All MCP tools are tenant-scoped via OAuth bearer tokens
- AsyncLocalStorage for request-scoped tool context (query results shared between tools)
