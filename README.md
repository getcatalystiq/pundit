# Pundit - Standalone MCP Server for Database Tools

[![GitHub](https://img.shields.io/badge/GitHub-getcatalystiq%2Fpundit-181717?logo=github)](https://github.com/getcatalystiq/pundit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/getcatalystiq/pundit/actions/workflows/ci.yml/badge.svg)](https://github.com/getcatalystiq/pundit/actions/workflows/ci.yml)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![MCP 2025-03-26](https://img.shields.io/badge/MCP-2025--03--26-green.svg)](https://modelcontextprotocol.io)

Pundit is a hosted MCP (Model Context Protocol) server that provides AI-powered database querying tools. It implements OAuth 2.1 with PKCE for secure authentication and uses RAG (Retrieval-Augmented Generation) to generate accurate SQL queries.

## Features

- **OAuth 2.1 Server** - Dynamic Client Registration, Authorization Code + PKCE
- **MCP 2025-03-26** - Streamable HTTP transport (serverless-friendly)
- **7 Database Tools** - Search, generate, execute, visualize, save patterns
- **Multi-tenant** - Isolated data per organization
- **RAG-powered SQL** - Uses pgvector for semantic search over schemas/docs/examples
- **Chart Rendering** - Plotly charts rendered to PNG images inline

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AWS Infrastructure                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   API Gateway (HTTP)                                                     │
│        │                                                                 │
│        ├── /.well-known/oauth-authorization-server  →  OAuth Lambda     │
│        ├── /oauth/*                                  →  OAuth Lambda     │
│        ├── /signup, /login                          →  OAuth Lambda     │
│        └── /mcp                                      →  MCP Lambda       │
│                                                                          │
│   Lambda Functions                                                       │
│        │                                                                 │
│        ├── OAuth Lambda (authentication, tokens)                        │
│        └── MCP Lambda (database tools, chart rendering)                 │
│                │                                                         │
│                ▼                                                         │
│   Aurora Serverless v2 (PostgreSQL + pgvector)                          │
│        │                                                                 │
│        ├── tenants, users (multi-tenant)                                │
│        ├── oauth_clients, tokens (OAuth data)                           │
│        ├── tenant_databases (connection configs)                        │
│        └── db_* tables (RAG training data)                              │
│                                                                          │
│   Secrets Manager                                                        │
│        │                                                                 │
│        ├── Aurora credentials                                           │
│        ├── OpenAI API key                                               │
│        └── Tenant database credentials                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- SAM CLI (`pip install aws-sam-cli`)
- Docker (for building Lambda layers)
- PostgreSQL client (for running migrations)

## Quick Start

### 1. Deploy Infrastructure

```bash
cd pundit

# Deploy to dev environment
./scripts/deploy.sh dev

# Or staging/prod
./scripts/deploy.sh staging
./scripts/deploy.sh prod
```

The deploy script will output the stack URLs:

```
McpServerUrl: https://<API_ID>.execute-api.us-east-1.amazonaws.com/mcp
API endpoint: https://<API_ID>.execute-api.us-east-1.amazonaws.com
OAuthMetadataUrl: https://<API_ID>.execute-api.us-east-1.amazonaws.com/.well-known/oauth-authorization-server
Admin UI: https://<CLOUDFRONT_ID>.cloudfront.net
```

### 2. Configure OpenAI API Key

```bash
aws secretsmanager put-secret-value \
  --secret-id pundit-dev-openai-api-key \
  --secret-string '{"api_key": "sk-your-openai-key-here"}'
```

### 3. Run Database Migrations

Connect to Aurora and run the schema:

```bash
# Get Aurora endpoint from AWS Console or CLI
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier pundit-dev-cluster \
  --query 'DBClusters[0].Endpoint' --output text)

# Get credentials from Secrets Manager
CREDENTIALS=$(aws secretsmanager get-secret-value \
  --secret-id pundit-dev-aurora-credentials \
  --query 'SecretString' --output text)

USERNAME=$(echo $CREDENTIALS | jq -r '.username')
PASSWORD=$(echo $CREDENTIALS | jq -r '.password')

# Run migrations (requires VPN/bastion to Aurora VPC)
PGPASSWORD=$PASSWORD psql \
  -h $AURORA_ENDPOINT \
  -U $USERNAME \
  -d pundit \
  -f migrations/001_initial_schema.sql
```

### 4. Create Your First Tenant

```bash
API_URL="https://<API_ID>.execute-api.us-east-1.amazonaws.com"

curl -X POST "$API_URL/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "My Company",
    "email": "admin@example.com",
    "password": "your-secure-password",
    "name": "Admin User"
  }'
```

Response:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "My Company",
    "slug": "my-company-a1b2"
  },
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "owner"
  }
}
```

### 5. Add a Database Connection

Connect to Aurora and insert a database configuration:

```sql
-- First, get your tenant_id from the signup response

INSERT INTO tenant_databases (tenant_id, name, db_type, connection_config, credentials_secret_arn, is_default)
VALUES (
  'your-tenant-uuid',
  'production',
  'postgresql',
  '{"host": "your-db-host.com", "port": 5432, "database": "mydb"}',
  'arn:aws:secretsmanager:us-east-1:123456789:secret:my-db-creds',
  true
);
```

Store the database credentials in Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name pundit-dev-tenant-db-mycompany-production \
  --secret-string '{
    "username": "readonly_user",
    "password": "db-password"
  }'
```

### 6. Add Training Data

Add schema definitions and documentation to improve SQL generation:

```sql
-- Add DDL (schema)
INSERT INTO db_ddl (tenant_id, database_id, ddl)
VALUES (
  'your-tenant-uuid',
  'your-database-uuid',
  'CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    total DECIMAL(10,2),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  );'
);

-- Add documentation
INSERT INTO db_documentation (tenant_id, database_id, documentation)
VALUES (
  'your-tenant-uuid',
  'your-database-uuid',
  'The orders table contains all customer orders. Status can be: pending, processing, shipped, delivered, cancelled. Total is in USD.'
);

-- Add example queries
INSERT INTO db_question_sql (tenant_id, database_id, question, sql)
VALUES (
  'your-tenant-uuid',
  'your-database-uuid',
  'What are the top 10 customers by total order value?',
  'SELECT c.name, SUM(o.total) as total_spent
   FROM customers c
   JOIN orders o ON c.id = o.customer_id
   WHERE o.status != ''cancelled''
   GROUP BY c.id, c.name
   ORDER BY total_spent DESC
   LIMIT 10;'
);
```

Note: Embeddings are generated automatically when using the MCP tools.

## Connecting Claude

### Register Claude as OAuth Client

Claude uses Dynamic Client Registration (RFC 7591):

```bash
API_URL="https://<API_ID>.execute-api.us-east-1.amazonaws.com"

curl -X POST "$API_URL/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Claude",
    "redirect_uris": ["https://claude.ai/oauth/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

Response:
```json
{
  "client_id": "pundit_abc123...",
  "client_name": "Claude",
  "redirect_uris": ["https://claude.ai/oauth/callback"],
  ...
}
```

### Add to Claude

1. Go to Claude Settings → Integrations
2. Add MCP Server with URL: `https://<API_ID>.execute-api.us-east-1.amazonaws.com/mcp`
3. Claude will discover OAuth metadata and prompt for login

## MCP Tools

| Tool | Description | Scope |
|------|-------------|-------|
| `search_database_context` | RAG search for schemas, docs, examples | read |
| `generate_sql` | Generate SQL from natural language | read |
| `execute_sql` | Execute SELECT queries | write |
| `visualize_data` | Create charts from query results | read |
| `save_sql_pattern` | Save successful query patterns | write |
| `save_business_context` | Save domain knowledge | write |
| `list_databases` | List available database connections | read |

## OAuth Scopes

| Scope | Permissions |
|-------|-------------|
| `read` | Search, generate SQL, list databases, visualize |
| `write` | Execute SQL, save patterns and context |
| `admin` | All permissions + manage training data |

## Security

### Credential Security

- Database credentials stored in AWS Secrets Manager
- Credentials retrieved just-in-time during requests
- No credential caching between requests
- All access logged in CloudTrail

### Network Security

- Aurora in private VPC subnets
- Lambda functions in VPC with NAT gateway
- VPC endpoints for Secrets Manager access
- No public database access

### Authentication

- OAuth 2.1 with mandatory PKCE
- JWT access tokens (1 hour expiry)
- Refresh token rotation
- Session management for MCP

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AURORA_SECRET_ARN` | Secrets Manager ARN for Aurora credentials |
| `AURORA_CLUSTER_ARN` | Aurora cluster ARN for Data API |
| `AURORA_DATABASE` | Database name (default: pundit) |
| `OPENAI_SECRET_ARN` | Secrets Manager ARN for OpenAI API key |
| `OAUTH_ISSUER` | OAuth issuer URL (API Gateway URL) |
| `LOG_LEVEL` | Logging level (default: INFO) |

## Development

### Local Testing

```bash
# Start local API (requires Docker)
sam local start-api

# Invoke function directly
sam local invoke McpFunction -e events/mcp-tools-list.json
```

### Running Tests

```bash
cd pundit
pytest tests/
```

## Cost Estimates

| Component | Pricing | Monthly Estimate |
|-----------|---------|-----------------|
| Aurora Serverless v2 | $0.12/ACU-hour | $5-50 (scales to 0) |
| Lambda | $0.20/1M requests | $1-10 |
| API Gateway | $1/1M requests | $1-5 |
| Secrets Manager | $0.40/secret/month | $2-5 |
| **Total** | | **$10-70/month** |

## Troubleshooting

### Lambda Timeout

Increase timeout in `template.yaml` if complex queries fail:
```yaml
McpFunction:
  Properties:
    Timeout: 300  # 5 minutes
```

### Layer Size Exceeded

If layers exceed 250MB limit, switch to container-based Lambda:
```yaml
McpFunction:
  Type: AWS::Serverless::Function
  Properties:
    PackageType: Image
  Metadata:
    DockerTag: python3.12
    DockerContext: ./src
    Dockerfile: Dockerfile
```

### Aurora Connection Issues

Ensure Lambda security group can reach Aurora:
```bash
aws ec2 describe-security-groups --group-ids sg-xxx
```

## License

MIT


Migrations are run through the migrations lambda function