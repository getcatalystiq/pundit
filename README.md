# Pundit - Hosted MCP Server for Database Tools

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP 2025-03-26](https://img.shields.io/badge/MCP-2025--03--26-green.svg)](https://modelcontextprotocol.io)

Pundit is a hosted MCP (Model Context Protocol) server that provides AI-powered database querying tools. It implements OAuth 2.1 with PKCE for secure authentication and uses RAG (Retrieval-Augmented Generation) to generate accurate SQL queries.

## Features

- **OAuth 2.1 Server** - Dynamic Client Registration, Authorization Code + PKCE (S256)
- **MCP 2025-03-26** - Streamable HTTP transport (serverless-friendly)
- **7 Database Tools** - Search, generate SQL, execute queries, visualize, save patterns
- **Multi-tenant** - Isolated data per organization with role-based access
- **RAG-powered SQL** - Semantic search over schemas, docs, and examples via pgvector
- **Chart Rendering** - Chart.js charts rendered server-side to PNG
- **Admin Dashboard** - React 19 UI for managing databases and training data
- **AI-powered Setup** - Auto-introspect schemas, generate documentation and example queries

## Architecture

```
Next.js 16 (App Router) → Vercel Serverless → Neon PostgreSQL (pgvector)

Endpoints:
  /.well-known/oauth-*           → OAuth metadata
  /api/oauth/*                   → OAuth 2.1 (DCR, PKCE S256, tokens)
  /api/signup, /api/login        → Account creation / admin login
  /mcp                           → MCP server (7 database tools)
  /api/admin/*                   → Admin dashboard API routes
  /dashboard, /databases, /users → Admin UI pages

AI Services (via Vercel AI Gateway):
  OpenAI      → text-embedding-3-small (1536-dim embeddings)
  Anthropic   → Claude Sonnet 4.6 (SQL generation, doc generation, analysis)
```

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database with pgvector
- [Vercel](https://vercel.com) account (Pro plan recommended)
- OpenAI API key (for embeddings)
- Anthropic API key (for SQL generation)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/getcatalystiq/pundit.git
cd pundit
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```bash
DATABASE_URL=postgresql://user:password@host/pundit?sslmode=require
JWT_SECRET=your-secret-key-at-least-32-characters-long
ENCRYPTION_KEY=64-hex-character-string-for-aes-256-gcm
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_URL=http://localhost:3000
```

### 3. Run Migrations

```bash
npm run migrate
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Create Your First Tenant

```bash
curl -X POST http://localhost:3000/api/signup \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "My Company",
    "email": "admin@example.com",
    "password": "your-secure-password",
    "name": "Admin User"
  }'
```

### 6. Deploy to Vercel

Push to `main` to auto-deploy, or deploy manually:

```bash
npx vercel --prod
```

## Connecting Claude

### 1. Add to Claude

1. Go to Claude Settings → Integrations
2. Add MCP Server with URL: `https://your-app.vercel.app/mcp`
3. Claude will discover OAuth metadata and prompt for login

Claude uses Dynamic Client Registration (RFC 7591) automatically. The server allows DCR from `claude.ai` by default (configurable via `ALLOWED_DCR_DOMAINS`).

### 2. Start Querying

Once connected, Claude can use all 7 MCP tools to search your database context, generate SQL, execute queries, create charts, and save patterns.

## MCP Tools

| Tool | Description | Scope |
|------|-------------|-------|
| `search_database_context` | Semantic search over schemas, docs, and examples | read |
| `generate_sql` | Generate SQL from natural language using Claude | read |
| `execute_sql` | Execute SELECT queries with row limits and audit logging | write |
| `visualize_data` | Create bar/line/scatter/pie/doughnut charts as PNG | read |
| `save_sql_pattern` | Save successful question/SQL pairs for future RAG | write |
| `save_business_context` | Save domain knowledge and column definitions | write |
| `list_databases` | List available database connections | read |

## OAuth Scopes

| Scope | Permissions |
|-------|-------------|
| `read` | Search context, generate SQL, list databases, visualize |
| `write` | Execute SQL, save patterns and business context |
| `admin` | All permissions + manage training data |

## Admin Dashboard

The built-in admin dashboard at `/dashboard` provides:

- **Database Management** - Add, configure, and test database connections
- **Training Data** - View and manage DDL, documentation, examples, tool memory, text memory
- **AI Tools** - Auto-pull schemas, generate documentation, generate example queries, analyze databases
- **User Management** - Create and manage tenant users with role-based access

## Security

- **OAuth 2.1** with mandatory PKCE (S256) and refresh token rotation
- **AES-256-GCM** encryption for tenant database credentials with HKDF key derivation
- **Read-only enforcement** - Only SELECT queries allowed on tenant databases
- **Audit logging** - All query executions logged with timestamps
- **JWT tokens** - 1-hour access tokens, 30-day refresh tokens
- **Security headers** - X-Content-Type-Options, Referrer-Policy, X-Frame-Options

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 master key (64 hex chars) |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob storage token |
| `OPENAI_API_KEY` | Yes | OpenAI API key (embeddings) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (SQL generation) |
| `NEXT_PUBLIC_URL` | Yes | Application public URL |
| `ENVIRONMENT` | No | `dev` or `prod` (default: `dev`) |
| `CRON_SECRET` | No | Vercel cron authentication |
| `ALLOWED_DCR_DOMAINS` | No | Comma-separated OAuth DCR domains (default: `claude.ai,localhost,127.0.0.1`) |

## Development

### Commands

```bash
npm run dev       # Start Next.js dev server with Turbopack
npm run build     # Production build with Turbopack
npm run lint      # Run ESLint
npm run migrate   # Run database migrations
```

### Project Structure

```
app/
  (admin)/          Admin dashboard pages (dashboard, databases, users)
  api/              API routes (OAuth, admin, cron, MCP)
  login/            Login page
  callback/         OAuth callback page
lib/
  db.ts             Neon tagged template, Pool, transactions
  oauth.ts          OAuth 2.1 with PKCE S256
  mcp-tools.ts      7 MCP tool implementations
  rag.ts            RAG search with CTE query + boosting
  embeddings.ts     OpenAI embeddings via Vercel AI Gateway
  sql-generator.ts  Claude SQL generation via generateObject
  crypto.ts         AES-256-GCM encryption with HKDF
  tenant-db.ts      External database connections (read-only)
  chart.ts          Chart.js server-side PNG rendering
  admin-auth.ts     Bearer token validation for admin routes
  env.ts            Lazy environment validation with Zod
  errors.ts         AppError type + Result<T> pattern
  utils.ts          Tailwind merge + jsonResponse helper
components/         React components (admin layout, UI primitives)
migrations/         PostgreSQL schema with pgvector HNSW indexes
scripts/            Migration runner
```

## License

MIT
