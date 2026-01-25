#!/bin/bash
#
# Build Lambda layers for Pundit MCP Server
#
# Creates one layer with all dependencies including altair/vl-convert for visualization
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAYERS_DIR="${PROJECT_DIR}/layers"

echo "Building Lambda layers..."

# Create layers directory structure
mkdir -p "${LAYERS_DIR}/dependencies/python"

# ============================================================================
# Dependencies Layer (includes all packages)
# ============================================================================
echo "Building dependencies layer..."

cat > "${LAYERS_DIR}/dependencies/requirements.txt" << 'EOF'
# Core (boto3 excluded - included in Lambda runtime)
httpx>=0.27.0
pydantic>=2.5.0
python-jose[cryptography]>=3.3.0
bcrypt>=4.1.0

# Database
psycopg2-binary>=2.9.9
pymysql>=1.1.0

# OpenAI
openai>=1.12.0

# Chart rendering
altair>=5.0.0
vl-convert-python>=1.0.0

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
find "${LAYERS_DIR}/dependencies/python" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -name "*.pyc" -delete 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -name "*.pyo" -delete 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -name "*.pyi" -delete 2>/dev/null || true
find "${LAYERS_DIR}/dependencies/python" -name "py.typed" -delete 2>/dev/null || true
# Remove numpy test data and docs
rm -rf "${LAYERS_DIR}/dependencies/python/numpy/tests" 2>/dev/null || true
rm -rf "${LAYERS_DIR}/dependencies/python/pandas/tests" 2>/dev/null || true
# Strip .so files to reduce size
find "${LAYERS_DIR}/dependencies/python" -name "*.so" -exec strip --strip-unneeded {} \; 2>/dev/null || true

# Calculate size
DEP_SIZE=$(du -sh "${LAYERS_DIR}/dependencies/python" | cut -f1)
echo "Dependencies layer size: ${DEP_SIZE}"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "Layer build complete!"
echo "  - dependencies: ${DEP_SIZE}"
echo ""
echo "Note: Lambda layer limit is 250MB unzipped."
echo "If layers are too large, consider using Lambda container images instead."
