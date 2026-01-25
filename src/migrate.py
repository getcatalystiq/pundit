"""Database migration handler (standalone - no package dependencies)."""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


def handler(event, context):
    """
    Run database migrations.

    This function executes SQL statements against Aurora Serverless
    using the Data API.
    """
    try:
        # Get configuration from environment
        secret_arn = os.environ.get("AURORA_SECRET_ARN")
        cluster_arn = os.environ.get("AURORA_CLUSTER_ARN")
        database = os.environ.get("AURORA_DATABASE", "pundit")

        if not secret_arn or not cluster_arn:
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Missing Aurora configuration"})
            }

        # Read migration file
        migration_sql = event.get("sql")
        if not migration_sql:
            # Try to read from bundled file
            migration_path = os.path.join(
                os.path.dirname(__file__),
                "..", "migrations", "001_initial_schema.sql"
            )
            if os.path.exists(migration_path):
                with open(migration_path, "r") as f:
                    migration_sql = f.read()
            else:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "No SQL provided and migration file not found"})
                }

        # Execute migrations using RDS Data API
        rds_data = boto3.client("rds-data")

        # Split SQL into individual statements
        # Filter out empty statements and comments-only blocks
        statements = []
        current_statement = []
        in_function = False

        for line in migration_sql.split('\n'):
            stripped = line.strip()

            # Skip pure comment lines (don't add to current_statement)
            if stripped.startswith('--') or stripped == '':
                continue

            # Track function/procedure blocks (they contain semicolons)
            if 'CREATE OR REPLACE FUNCTION' in line or 'CREATE FUNCTION' in line:
                in_function = True

            # Function blocks end with $$ followed by optional LANGUAGE clause and ;
            # e.g., "$$;" or "$$ LANGUAGE plpgsql;"
            if in_function and stripped.startswith('$$') and stripped.endswith(';'):
                in_function = False
                current_statement.append(line)
                statements.append('\n'.join(current_statement))
                current_statement = []
                continue

            current_statement.append(line)

            # If not in function and line ends with semicolon, it's end of statement
            if not in_function and stripped.endswith(';'):
                stmt = '\n'.join(current_statement).strip()
                if stmt:
                    statements.append(stmt)
                current_statement = []

        # Execute each statement
        results = []
        for i, stmt in enumerate(statements):
            if not stmt.strip() or stmt.strip().startswith('--'):
                continue

            try:
                logger.info(f"Executing statement {i + 1}/{len(statements)}")
                rds_data.execute_statement(
                    secretArn=secret_arn,
                    resourceArn=cluster_arn,
                    database=database,
                    sql=stmt
                )
                results.append({"statement": i + 1, "status": "success"})
            except Exception as e:
                error_msg = str(e)
                # Ignore "already exists" errors (idempotent migrations)
                if "already exists" in error_msg.lower():
                    logger.info(f"Statement {i + 1}: Already exists, skipping")
                    results.append({"statement": i + 1, "status": "skipped", "reason": "already exists"})
                else:
                    logger.error(f"Statement {i + 1} failed: {error_msg}")
                    results.append({"statement": i + 1, "status": "error", "error": error_msg})

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Migration completed",
                "total_statements": len(statements),
                "results": results
            })
        }

    except Exception as e:
        logger.exception(f"Migration failed: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
