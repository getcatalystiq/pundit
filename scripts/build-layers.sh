#!/bin/bash
#
# Build Lambda layers for Pundit MCP Server
#
# Creates two layers:
#   1. dependencies - Python packages (boto3, httpx, openai, psycopg2, etc.)
#   2. kaleido - Plotly chart rendering (large binary)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAYERS_DIR="${PROJECT_DIR}/layers"

echo "Building Lambda layers..."

# Create layers directory structure
mkdir -p "${LAYERS_DIR}/dependencies/python"
mkdir -p "${LAYERS_DIR}/kaleido/python"

# ============================================================================
# Layer 1: Dependencies
# ============================================================================
echo "Building dependencies layer..."

cat > "${LAYERS_DIR}/dependencies/requirements.txt" << 'EOF'
# Core
boto3>=1.34.0
httpx>=0.27.0
pydantic>=2.5.0
python-jose[cryptography]>=3.3.0
bcrypt>=4.1.0

# Database
psycopg2-binary>=2.9.9
pymysql>=1.1.0

# OpenAI
openai>=1.12.0

# Data processing
pandas>=2.1.0

# Utilities
python-multipart>=0.0.6
email-validator>=2.1.0
EOF

# Build in Docker to match Lambda environment
docker run --rm \
    -v "${LAYERS_DIR}/dependencies:/var/task" \
    public.ecr.aws/sam/build-python3.12:latest \
    pip install -r /var/task/requirements.txt -t /var/task/python --no-cache-dir

# Remove unnecessary files to reduce layer size
find "${LAYERS_DIR}/dependencies/python" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -name "*.pyc" -delete 2>/dev/null || true

# Calculate size
DEP_SIZE=$(du -sh "${LAYERS_DIR}/dependencies/python" | cut -f1)
echo "Dependencies layer size: ${DEP_SIZE}"

# ============================================================================
# Layer 2: Kaleido (for Plotly chart rendering)
# ============================================================================
echo "Building Kaleido layer..."

cat > "${LAYERS_DIR}/kaleido/requirements.txt" << 'EOF'
plotly>=5.18.0
kaleido>=0.2.1
EOF

# Build in Docker
docker run --rm \
    -v "${LAYERS_DIR}/kaleido:/var/task" \
    public.ecr.aws/sam/build-python3.12:latest \
    pip install -r /var/task/requirements.txt -t /var/task/python --no-cache-dir

# Kaleido needs special handling - it includes binaries
# Remove unnecessary files
find "${LAYERS_DIR}/kaleido/python" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/kaleido/python" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/kaleido/python" -name "*.pyc" -delete 2>/dev/null || true

# Calculate size
KAL_SIZE=$(du -sh "${LAYERS_DIR}/kaleido/python" | cut -f1)
echo "Kaleido layer size: ${KAL_SIZE}"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "Layer build complete!"
echo "  - dependencies: ${DEP_SIZE}"
echo "  - kaleido: ${KAL_SIZE}"
echo ""
echo "Note: Lambda layer limit is 250MB unzipped."
echo "If layers are too large, consider using Lambda container images instead."
