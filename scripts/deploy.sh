#!/bin/bash
#
# Pundit MCP Server - Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [environment]
#
# Environments: dev (default), staging, prod
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - SAM CLI installed (pip install aws-sam-cli)
#   - Docker running (for building Lambda layers)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-dev}"
STACK_NAME="pundit-${ENVIRONMENT}"
REGION="${AWS_REGION:-us-east-1}"
S3_BUCKET="${SAM_BUCKET:-pundit-sam-artifacts-${ENVIRONMENT}}"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Pundit MCP Server - Deployment                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Stack Name:  ${YELLOW}${STACK_NAME}${NC}"
echo -e "Region:      ${YELLOW}${REGION}${NC}"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v sam &> /dev/null; then
    echo -e "${RED}Error: SAM CLI not found. Install with: pip install aws-sam-cli${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker not found. Docker is required for building layers.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon not running. Please start Docker.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Build Lambda layers
echo -e "${YELLOW}Building Lambda layers...${NC}"
./scripts/build-layers.sh
echo -e "${GREEN}✓ Layers built${NC}"
echo ""

# Create S3 bucket for SAM artifacts if it doesn't exist
echo -e "${YELLOW}Ensuring S3 bucket exists: ${S3_BUCKET}${NC}"
if ! aws s3 ls "s3://${S3_BUCKET}" 2>&1 > /dev/null; then
    echo "Creating S3 bucket..."
    aws s3 mb "s3://${S3_BUCKET}" --region "${REGION}"
    aws s3api put-bucket-versioning \
        --bucket "${S3_BUCKET}" \
        --versioning-configuration Status=Enabled
fi
echo -e "${GREEN}✓ S3 bucket ready${NC}"
echo ""

# SAM Build
echo -e "${YELLOW}Building SAM application...${NC}"
sam build \
    --use-container \
    --parallel \
    --cached

echo -e "${GREEN}✓ SAM build complete${NC}"
echo ""

# SAM Deploy
echo -e "${YELLOW}Deploying to AWS...${NC}"
sam deploy \
    --stack-name "${STACK_NAME}" \
    --s3-bucket "${S3_BUCKET}" \
    --s3-prefix "${STACK_NAME}" \
    --region "${REGION}" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides \
        Environment="${ENVIRONMENT}" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Deployment Complete!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get outputs
echo -e "${YELLOW}Stack Outputs:${NC}"
aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Update OpenAI API key in Secrets Manager:"
echo "   aws secretsmanager put-secret-value \\"
echo "     --secret-id pundit-${ENVIRONMENT}-openai-api-key \\"
echo "     --secret-string '{\"api_key\": \"sk-your-key-here\"}'"
echo ""
echo "2. Run database migrations (connect to Aurora and run SQL):"
echo "   psql -f migrations/001_initial_schema.sql"
echo ""
echo "3. Register Claude as an OAuth client using the MCP metadata endpoint"
echo ""
