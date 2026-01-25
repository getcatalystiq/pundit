#!/bin/bash
#
# Pundit Local Development Script
#
# Starts all services needed for local development:
#   - PostgreSQL (via Docker)
#   - SAM Local API Gateway
#   - Admin UI (Vite dev server)
#
# Usage:
#   ./scripts/local-dev.sh          # Start all services
#   ./scripts/local-dev.sh --api    # Start only API (SAM Local)
#   ./scripts/local-dev.sh --ui     # Start only Admin UI
#   ./scripts/local-dev.sh --db     # Start only PostgreSQL
#   ./scripts/local-dev.sh --stop   # Stop all services
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ADMIN_UI_DIR="${PROJECT_DIR}/admin-ui"
LOG_DIR="/tmp/pundit-logs"

# Default ports
DB_PORT=5432
API_PORT=3000
UI_PORT=5173

# Parse arguments
START_DB=false
START_API=false
START_UI=false
STOP_ALL=false

if [ $# -eq 0 ]; then
    START_DB=true
    START_API=true
    START_UI=true
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --db)
            START_DB=true
            shift
            ;;
        --api)
            START_API=true
            shift
            ;;
        --ui)
            START_UI=true
            shift
            ;;
        --stop)
            STOP_ALL=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --db      Start PostgreSQL database only"
            echo "  --api     Start SAM Local API only"
            echo "  --ui      Start Admin UI only"
            echo "  --stop    Stop all services"
            echo "  --help    Show this help"
            echo ""
            echo "If no options provided, starts all services."
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create log directory
mkdir -p "$LOG_DIR"

# =============================================================================
# Helper Functions
# =============================================================================

check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

wait_for_port() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=1

    echo -n "Waiting for $name..."
    while ! check_port $port; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e " ${RED}FAILED${NC}"
            return 1
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e " ${GREEN}OK${NC}"
    return 0
}

stop_services() {
    echo -e "${YELLOW}Stopping services...${NC}"

    # Stop SAM Local
    if pgrep -f "sam local" >/dev/null 2>&1; then
        echo "Stopping SAM Local..."
        pkill -f "sam local" || true
    fi

    # Stop Vite
    if pgrep -f "vite" >/dev/null 2>&1; then
        echo "Stopping Vite..."
        pkill -f "vite" || true
    fi

    # Stop PostgreSQL container
    if docker ps --format '{{.Names}}' | grep -q "pundit-postgres"; then
        echo "Stopping PostgreSQL..."
        docker stop pundit-postgres >/dev/null 2>&1 || true
        docker rm pundit-postgres >/dev/null 2>&1 || true
    fi

    echo -e "${GREEN}All services stopped${NC}"
}

# =============================================================================
# Stop if requested
# =============================================================================

if [ "$STOP_ALL" = true ]; then
    stop_services
    exit 0
fi

# =============================================================================
# Load environment
# =============================================================================

if [ -f "${PROJECT_DIR}/.env.local" ]; then
    echo -e "${BLUE}Loading .env.local...${NC}"
    set -a
    source "${PROJECT_DIR}/.env.local"
    set +a
elif [ -f "${PROJECT_DIR}/.env" ]; then
    echo -e "${BLUE}Loading .env...${NC}"
    set -a
    source "${PROJECT_DIR}/.env"
    set +a
else
    echo -e "${YELLOW}Warning: No .env or .env.local found. Using defaults.${NC}"
    echo "Copy .env.example to .env.local and configure it."
fi

# =============================================================================
# Start PostgreSQL
# =============================================================================

if [ "$START_DB" = true ]; then
    echo -e "${BLUE}Starting PostgreSQL...${NC}"

    if check_port $DB_PORT; then
        echo -e "${YELLOW}PostgreSQL already running on port $DB_PORT${NC}"
    else
        # Check if container exists but stopped
        if docker ps -a --format '{{.Names}}' | grep -q "pundit-postgres"; then
            docker start pundit-postgres
        else
            docker run -d \
                --name pundit-postgres \
                -e POSTGRES_USER="${DATABASE_USER:-pundit_admin}" \
                -e POSTGRES_PASSWORD="${DATABASE_PASSWORD:-localdevpassword}" \
                -e POSTGRES_DB="${DATABASE_NAME:-pundit}" \
                -p "${DB_PORT}:5432" \
                -v pundit-postgres-data:/var/lib/postgresql/data \
                pgvector/pgvector:pg16
        fi

        wait_for_port $DB_PORT "PostgreSQL" || exit 1

        # Run migrations if this is first time
        echo -e "${BLUE}Checking migrations...${NC}"
        sleep 2  # Wait for PostgreSQL to be fully ready

        if ! PGPASSWORD="${DATABASE_PASSWORD:-localdevpassword}" psql \
            -h localhost \
            -p $DB_PORT \
            -U "${DATABASE_USER:-pundit_admin}" \
            -d "${DATABASE_NAME:-pundit}" \
            -c "SELECT 1 FROM tenants LIMIT 1" >/dev/null 2>&1; then
            echo -e "${YELLOW}Running initial migrations...${NC}"
            PGPASSWORD="${DATABASE_PASSWORD:-localdevpassword}" psql \
                -h localhost \
                -p $DB_PORT \
                -U "${DATABASE_USER:-pundit_admin}" \
                -d "${DATABASE_NAME:-pundit}" \
                -f "${PROJECT_DIR}/migrations/001_initial_schema.sql"
            echo -e "${GREEN}Migrations complete${NC}"
        else
            echo -e "${GREEN}Database already initialized${NC}"
        fi
    fi
fi

# =============================================================================
# Build Lambda Layers (if not exist)
# =============================================================================

if [ "$START_API" = true ]; then
    if [ ! -d "${PROJECT_DIR}/layers/dependencies/python" ]; then
        echo -e "${YELLOW}Lambda layers not found. Building...${NC}"
        "${SCRIPT_DIR}/build-layers.sh"
    fi
fi

# =============================================================================
# Start SAM Local API
# =============================================================================

if [ "$START_API" = true ]; then
    echo -e "${BLUE}Starting SAM Local API...${NC}"

    if check_port $API_PORT; then
        echo -e "${YELLOW}API already running on port $API_PORT${NC}"
    else
        cd "$PROJECT_DIR"

        # Create SAM local env file
        cat > /tmp/pundit-sam-env.json << EOF
{
    "Parameters": {
        "LOG_LEVEL": "${LOG_LEVEL:-DEBUG}",
        "DATABASE_HOST": "${DATABASE_HOST:-host.docker.internal}",
        "DATABASE_PORT": "${DATABASE_PORT:-5432}",
        "DATABASE_NAME": "${DATABASE_NAME:-pundit}",
        "DATABASE_USER": "${DATABASE_USER:-pundit_admin}",
        "DATABASE_PASSWORD": "${DATABASE_PASSWORD:-localdevpassword}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY:-}",
        "OAUTH_ISSUER": "http://localhost:${API_PORT}",
        "JWT_SECRET": "${JWT_SECRET:-local-dev-jwt-secret}",
        "BEDROCK_REGION": "${BEDROCK_REGION:-us-east-1}",
        "BEDROCK_MODEL_ID": "${BEDROCK_MODEL_ID:-anthropic.claude-opus-4-5-20251101-v1:0}"
    }
}
EOF

        # Start SAM local in background
        sam local start-api \
            --port $API_PORT \
            --env-vars /tmp/pundit-sam-env.json \
            --docker-network host \
            --warm-containers EAGER \
            > "${LOG_DIR}/sam-local.log" 2>&1 &

        wait_for_port $API_PORT "SAM Local API" || {
            echo -e "${RED}Failed to start SAM Local. Check logs: ${LOG_DIR}/sam-local.log${NC}"
            exit 1
        }
    fi
fi

# =============================================================================
# Start Admin UI
# =============================================================================

if [ "$START_UI" = true ]; then
    echo -e "${BLUE}Starting Admin UI...${NC}"

    if check_port $UI_PORT; then
        echo -e "${YELLOW}Admin UI already running on port $UI_PORT${NC}"
    else
        cd "$ADMIN_UI_DIR"

        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            echo "Installing npm dependencies..."
            npm install --silent
        fi

        # Create .env.local if not exists
        if [ ! -f ".env.local" ]; then
            echo "VITE_API_URL=http://localhost:${API_PORT}" > .env.local
        fi

        # Start Vite in background
        npm run dev > "${LOG_DIR}/admin-ui.log" 2>&1 &

        wait_for_port $UI_PORT "Admin UI" || {
            echo -e "${RED}Failed to start Admin UI. Check logs: ${LOG_DIR}/admin-ui.log${NC}"
            exit 1
        }
    fi
fi

# =============================================================================
# Print Summary
# =============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Pundit Local Development Ready                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$START_DB" = true ]; then
    echo -e "  ${BLUE}PostgreSQL:${NC}  postgres://localhost:${DB_PORT}/${DATABASE_NAME:-pundit}"
fi

if [ "$START_API" = true ]; then
    echo -e "  ${BLUE}API:${NC}         http://localhost:${API_PORT}"
    echo -e "  ${BLUE}OAuth:${NC}       http://localhost:${API_PORT}/.well-known/oauth-authorization-server"
    echo -e "  ${BLUE}MCP:${NC}         http://localhost:${API_PORT}/mcp"
fi

if [ "$START_UI" = true ]; then
    echo -e "  ${BLUE}Admin UI:${NC}    http://localhost:${UI_PORT}"
fi

echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "  SAM Local:  tail -f ${LOG_DIR}/sam-local.log"
echo "  Admin UI:   tail -f ${LOG_DIR}/admin-ui.log"
echo ""
echo -e "${YELLOW}To stop:${NC}  $0 --stop"
echo ""
