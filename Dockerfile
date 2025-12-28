FROM amazon/aws-lambda-python:3.12-arm64

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and ensure readable permissions
COPY src/ ${LAMBDA_TASK_ROOT}/
RUN chmod -R a+r ${LAMBDA_TASK_ROOT}/

# Default handler (overridden per function in template.yaml)
CMD ["mcp.server.handler"]
