#!/bin/bash
# Run database migrations against Aurora via Lambda
set -e

ENVIRONMENT="${1:-prod}"
MIGRATION_FILE="${2:-migrations/001_initial_schema.sql}"

echo "Running migrations for environment: $ENVIRONMENT"
echo "Migration file: $MIGRATION_FILE"

# Check if migration file exists
if [[ ! -f "$MIGRATION_FILE" ]]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Create payload with SQL content
PAYLOAD_FILE=$(mktemp)
python3 -c "
import json
import sys
with open('$MIGRATION_FILE', 'r') as f:
    sql = f.read()
print(json.dumps({'sql': sql}))
" > "$PAYLOAD_FILE"

echo "Invoking migration Lambda..."
OUTPUT_FILE=$(mktemp)

aws lambda invoke \
    --function-name "pundit-${ENVIRONMENT}-migrate" \
    --payload "file://$PAYLOAD_FILE" \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 300 \
    "$OUTPUT_FILE"

echo ""
echo "Migration result:"
cat "$OUTPUT_FILE" | python3 -c "
import json
import sys
data = json.load(sys.stdin)
body = json.loads(data.get('body', '{}'))
print(f\"Message: {body.get('message', 'N/A')}\")
print(f\"Total statements: {body.get('total_statements', 0)}\")
results = body.get('results', [])
success = sum(1 for r in results if r.get('status') == 'success')
skipped = sum(1 for r in results if r.get('status') == 'skipped')
errors = sum(1 for r in results if r.get('status') == 'error')
print(f\"Success: {success}, Skipped: {skipped}, Errors: {errors}\")
if errors > 0:
    print('\\nErrors:')
    for r in results:
        if r.get('status') == 'error':
            print(f\"  Statement {r.get('statement')}: {r.get('error', 'Unknown error')[:100]}\")
"

# Cleanup
rm -f "$PAYLOAD_FILE" "$OUTPUT_FILE"

echo ""
echo "Migration complete!"
