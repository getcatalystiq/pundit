"""
Tenant Admin API Handler.

OAuth authenticated - tenant admins (role=owner/admin) can manage their own tenant.
Endpoints: /admin/*

Authentication: Bearer token with admin scope
Authorization: Can only access resources in their own tenant
"""

import base64
import json
import logging
from typing import Any, Optional

from ..oauth.tokens import get_token_claims
from ..db.aurora import get_aurora_client, param
from ..db.embeddings import generate_embedding

logger = logging.getLogger(__name__)


def handler(event: dict, context: Any) -> dict:
    """
    Lambda handler for tenant admin endpoints.

    All endpoints require OAuth Bearer token with admin scope.
    Users can only manage resources in their own tenant.
    """
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "")
    path_params = event.get("pathParameters", {}) or {}
    headers = event.get("headers", {})
    body = event.get("body", "")

    # Parse body
    if body and event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    body_params = {}
    if body:
        try:
            body_params = json.loads(body)
        except json.JSONDecodeError:
            pass

    # Authenticate
    auth_header = headers.get("authorization") or headers.get("Authorization")
    if not auth_header:
        return _error_response(401, "Missing Authorization header")

    try:
        claims = get_token_claims(auth_header)
    except Exception as e:
        return _error_response(401, f"Invalid token: {e}")

    # Check for admin scope
    scopes = claims.get("scope", "").split()
    if "admin" not in scopes and "write" not in scopes:
        return _error_response(403, "Requires admin or write scope")

    tenant_id = claims["tenant_id"]
    user_id = claims["sub"]

    try:
        # Route to handler
        # Database management
        if path == "/admin/databases" and http_method == "GET":
            return _list_databases(tenant_id)
        elif path == "/admin/databases" and http_method == "POST":
            return _create_database(tenant_id, body_params)
        elif path.startswith("/admin/databases/") and http_method == "GET":
            database_id = path_params.get("database_id")
            return _get_database(tenant_id, database_id)
        elif path.startswith("/admin/databases/") and http_method == "PUT":
            database_id = path_params.get("database_id")
            return _update_database(tenant_id, database_id, body_params)
        elif path.startswith("/admin/databases/") and http_method == "DELETE":
            database_id = path_params.get("database_id")
            if "/ddl/" in path:
                ddl_id = path_params.get("id")
                return _delete_ddl(tenant_id, database_id, ddl_id)
            elif "/docs/" in path:
                doc_id = path_params.get("id")
                return _delete_doc(tenant_id, database_id, doc_id)
            elif "/examples/" in path:
                example_id = path_params.get("id")
                return _delete_example(tenant_id, database_id, example_id)
            else:
                return _delete_database(tenant_id, database_id)

        # Training data - DDL
        elif "/ddl" in path and http_method == "GET":
            database_id = path_params.get("database_id")
            return _list_ddl(tenant_id, database_id)
        elif "/ddl" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _add_ddl(tenant_id, database_id, body_params)

        # Training data - Documentation
        elif "/docs" in path and http_method == "GET":
            database_id = path_params.get("database_id")
            return _list_docs(tenant_id, database_id)
        elif "/docs" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _add_doc(tenant_id, database_id, body_params)

        # Training data - Examples
        elif "/examples" in path and http_method == "GET":
            database_id = path_params.get("database_id")
            return _list_examples(tenant_id, database_id)
        elif "/examples" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _add_example(tenant_id, database_id, body_params)

        # AI Generation endpoints
        elif "/ai/pull-ddl" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _ai_pull_ddl(tenant_id, database_id, body_params)
        elif "/ai/generate-docs" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _ai_generate_docs(tenant_id, database_id, body_params)
        elif "/ai/generate-examples" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _ai_generate_examples(tenant_id, database_id, body_params)
        elif "/ai/analyze" in path and http_method == "POST":
            database_id = path_params.get("database_id")
            return _ai_analyze_schema(tenant_id, database_id)

        # User management
        elif path == "/admin/users" and http_method == "GET":
            return _list_users(tenant_id)
        elif path == "/admin/users" and http_method == "POST":
            return _create_user(tenant_id, body_params)
        elif path.startswith("/admin/users/") and http_method == "PUT":
            target_user_id = path_params.get("user_id")
            return _update_user(tenant_id, target_user_id, body_params)
        elif path.startswith("/admin/users/") and http_method == "DELETE":
            target_user_id = path_params.get("user_id")
            return _delete_user(tenant_id, user_id, target_user_id)

        return _error_response(404, "Endpoint not found")

    except Exception as e:
        logger.exception(f"Admin error: {e}")
        return _error_response(500, str(e))


# =============================================================================
# Database Management
# =============================================================================

def _list_databases(tenant_id: str) -> dict:
    """List all databases for the tenant."""
    aurora = get_aurora_client()
    databases = aurora.query(
        """
        SELECT id, name, db_type, is_default, enabled, created_at, updated_at
        FROM tenant_databases
        WHERE tenant_id = :tenant_id::uuid
        ORDER BY name
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )
    return _success_response({"databases": databases})


def _get_database(tenant_id: str, database_id: str) -> dict:
    """Get database details with training data counts."""
    aurora = get_aurora_client()

    db = aurora.query_one(
        """
        SELECT id, name, db_type, connection_config, is_default, enabled, created_at
        FROM tenant_databases
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        """,
        [
            param("id", database_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
        ]
    )

    if not db:
        return _error_response(404, "Database not found")

    # Get training data counts
    ddl_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM db_ddl WHERE database_id = :id::uuid",
        [param("id", database_id, "UUID")]
    )
    doc_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM db_documentation WHERE database_id = :id::uuid",
        [param("id", database_id, "UUID")]
    )
    example_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM db_question_sql WHERE database_id = :id::uuid",
        [param("id", database_id, "UUID")]
    )

    db["training_data"] = {
        "ddl_count": ddl_count["count"] if ddl_count else 0,
        "documentation_count": doc_count["count"] if doc_count else 0,
        "examples_count": example_count["count"] if example_count else 0,
    }

    return _success_response(db)


def _create_database(tenant_id: str, data: dict) -> dict:
    """Create a new database connection."""
    name = data.get("name")
    db_type = data.get("db_type")
    connection_config = data.get("connection_config", {})
    credentials_secret_arn = data.get("credentials_secret_arn")
    is_default = data.get("is_default", False)

    if not name or not db_type:
        return _error_response(400, "name and db_type are required")

    aurora = get_aurora_client()

    # If setting as default, unset other defaults
    if is_default:
        aurora.execute(
            "UPDATE tenant_databases SET is_default = FALSE WHERE tenant_id = :tenant_id::uuid",
            [param("tenant_id", tenant_id, "UUID")]
        )

    result = aurora.query_one(
        """
        INSERT INTO tenant_databases
            (tenant_id, name, db_type, connection_config, credentials_secret_arn, is_default)
        VALUES
            (:tenant_id::uuid, :name, :db_type, :connection_config::jsonb, :credentials_secret_arn, :is_default)
        RETURNING id, name, db_type, is_default, created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("name", name),
            param("db_type", db_type),
            param("connection_config", json.dumps(connection_config)),
            param("credentials_secret_arn", credentials_secret_arn),
            param("is_default", is_default),
        ]
    )

    return _success_response(result, 201)


def _update_database(tenant_id: str, database_id: str, data: dict) -> dict:
    """Update database configuration."""
    aurora = get_aurora_client()

    # Build update query dynamically
    updates = []
    params = [
        param("id", database_id, "UUID"),
        param("tenant_id", tenant_id, "UUID"),
    ]

    if "name" in data:
        updates.append("name = :name")
        params.append(param("name", data["name"]))

    if "connection_config" in data:
        updates.append("connection_config = :connection_config::jsonb")
        params.append(param("connection_config", json.dumps(data["connection_config"])))

    if "credentials_secret_arn" in data:
        updates.append("credentials_secret_arn = :credentials_secret_arn")
        params.append(param("credentials_secret_arn", data["credentials_secret_arn"]))

    if "enabled" in data:
        updates.append("enabled = :enabled")
        params.append(param("enabled", data["enabled"]))

    if "is_default" in data and data["is_default"]:
        # Unset other defaults first
        aurora.execute(
            "UPDATE tenant_databases SET is_default = FALSE WHERE tenant_id = :tenant_id::uuid",
            [param("tenant_id", tenant_id, "UUID")]
        )
        updates.append("is_default = TRUE")

    if not updates:
        return _error_response(400, "No fields to update")

    result = aurora.query_one(
        f"""
        UPDATE tenant_databases
        SET {", ".join(updates)}, updated_at = NOW()
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        RETURNING id, name, db_type, is_default, enabled, updated_at
        """,
        params
    )

    if not result:
        return _error_response(404, "Database not found")

    return _success_response(result)


def _delete_database(tenant_id: str, database_id: str) -> dict:
    """Delete a database and its training data."""
    aurora = get_aurora_client()

    result = aurora.query_one(
        """
        DELETE FROM tenant_databases
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        RETURNING id
        """,
        [
            param("id", database_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "Database not found")

    return _success_response({"deleted": True})


# =============================================================================
# Training Data - DDL
# =============================================================================

def _list_ddl(tenant_id: str, database_id: str) -> dict:
    """List DDL entries for a database."""
    aurora = get_aurora_client()
    entries = aurora.query(
        """
        SELECT id, ddl, created_at
        FROM db_ddl
        WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        ORDER BY created_at DESC
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )
    return _success_response({"ddl": entries})


def _add_ddl(tenant_id: str, database_id: str, data: dict) -> dict:
    """Add DDL entry with embedding."""
    ddl = data.get("ddl")
    if not ddl:
        return _error_response(400, "ddl is required")

    # Generate embedding
    embedding = generate_embedding(ddl)

    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        INSERT INTO db_ddl (tenant_id, database_id, ddl, embedding)
        VALUES (:tenant_id::uuid, :database_id::uuid, :ddl, :embedding::vector)
        RETURNING id, created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
            param("ddl", ddl),
            param("embedding", json.dumps(embedding)),
        ]
    )

    return _success_response({"id": result["id"], "created_at": result["created_at"]}, 201)


def _delete_ddl(tenant_id: str, database_id: str, ddl_id: str) -> dict:
    """Delete DDL entry."""
    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        DELETE FROM db_ddl
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        RETURNING id
        """,
        [
            param("id", ddl_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "DDL entry not found")

    return _success_response({"deleted": True})


# =============================================================================
# Training Data - Documentation
# =============================================================================

def _list_docs(tenant_id: str, database_id: str) -> dict:
    """List documentation entries."""
    aurora = get_aurora_client()
    entries = aurora.query(
        """
        SELECT id, documentation, created_at
        FROM db_documentation
        WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        ORDER BY created_at DESC
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )
    return _success_response({"documentation": entries})


def _add_doc(tenant_id: str, database_id: str, data: dict) -> dict:
    """Add documentation entry with embedding."""
    documentation = data.get("documentation")
    if not documentation:
        return _error_response(400, "documentation is required")

    embedding = generate_embedding(documentation)

    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
        VALUES (:tenant_id::uuid, :database_id::uuid, :documentation, :embedding::vector)
        RETURNING id, created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
            param("documentation", documentation),
            param("embedding", json.dumps(embedding)),
        ]
    )

    return _success_response({"id": result["id"], "created_at": result["created_at"]}, 201)


def _delete_doc(tenant_id: str, database_id: str, doc_id: str) -> dict:
    """Delete documentation entry."""
    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        DELETE FROM db_documentation
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        RETURNING id
        """,
        [
            param("id", doc_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "Documentation entry not found")

    return _success_response({"deleted": True})


# =============================================================================
# Training Data - Examples
# =============================================================================

def _list_examples(tenant_id: str, database_id: str) -> dict:
    """List example queries."""
    aurora = get_aurora_client()
    entries = aurora.query(
        """
        SELECT id, question, sql, created_at
        FROM db_question_sql
        WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        ORDER BY created_at DESC
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )
    return _success_response({"examples": entries})


def _add_example(tenant_id: str, database_id: str, data: dict) -> dict:
    """Add example query with embedding."""
    question = data.get("question")
    sql = data.get("sql")

    if not question or not sql:
        return _error_response(400, "question and sql are required")

    embedding = generate_embedding(question)

    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        INSERT INTO db_question_sql (tenant_id, database_id, question, sql, embedding)
        VALUES (:tenant_id::uuid, :database_id::uuid, :question, :sql, :embedding::vector)
        RETURNING id, created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
            param("question", question),
            param("sql", sql),
            param("embedding", json.dumps(embedding)),
        ]
    )

    return _success_response({"id": result["id"], "created_at": result["created_at"]}, 201)


def _delete_example(tenant_id: str, database_id: str, example_id: str) -> dict:
    """Delete example query."""
    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        DELETE FROM db_question_sql
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        RETURNING id
        """,
        [
            param("id", example_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "Example not found")

    return _success_response({"deleted": True})


# =============================================================================
# AI Generation
# =============================================================================

def _get_database_ddl(tenant_id: str, database_id: str) -> str:
    """Get all DDL entries for a database as a single string."""
    aurora = get_aurora_client()
    entries = aurora.query(
        """
        SELECT ddl FROM db_ddl
        WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        ORDER BY created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )
    return "\n\n".join(entry["ddl"] for entry in entries)


def _get_database_docs(tenant_id: str, database_id: str) -> list[str]:
    """Get all documentation entries for a database."""
    aurora = get_aurora_client()
    entries = aurora.query(
        """
        SELECT documentation FROM db_documentation
        WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        ORDER BY created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )
    return [entry["documentation"] for entry in entries]


def _ai_pull_ddl(tenant_id: str, database_id: str, data: dict) -> dict:
    """
    Pull DDL from the connected database.

    Connects to the tenant's database and introspects the schema.
    """
    from ..db.connections import TenantConnectionManager
    from ..ai.schema import SchemaIntrospector

    aurora = get_aurora_client()

    # Get database config
    db = aurora.query_one(
        """
        SELECT db_type, connection_config, credentials_secret_arn
        FROM tenant_databases
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        """,
        [
            param("id", database_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
        ]
    )

    if not db:
        return _error_response(404, "Database not found")

    schema = data.get("schema", "public")
    tables = data.get("tables")  # Optional: specific tables to pull

    try:
        # Get connection to tenant database
        conn_manager = TenantConnectionManager()
        connection = conn_manager.get_connection(
            db["db_type"],
            db["connection_config"],
            db["credentials_secret_arn"]
        )

        # Introspect schema
        introspector = SchemaIntrospector(connection, db["db_type"])
        ddl = introspector.get_ddl(schema, tables)

        # Optionally auto-save the DDL
        if data.get("auto_save", False):
            embedding = generate_embedding(ddl)
            aurora.execute(
                """
                INSERT INTO db_ddl (tenant_id, database_id, ddl, embedding)
                VALUES (:tenant_id::uuid, :database_id::uuid, :ddl, :embedding::vector)
                """,
                [
                    param("tenant_id", tenant_id, "UUID"),
                    param("database_id", database_id, "UUID"),
                    param("ddl", ddl),
                    param("embedding", json.dumps(embedding)),
                ]
            )

        # Get table list
        table_list = introspector.get_tables(schema)

        return _success_response({
            "ddl": ddl,
            "tables": table_list,
            "schema": schema,
            "saved": data.get("auto_save", False),
        })

    except Exception as e:
        logger.exception(f"Failed to pull DDL: {e}")
        return _error_response(500, f"Failed to connect to database: {str(e)}")


def _ai_generate_docs(tenant_id: str, database_id: str, data: dict) -> dict:
    """
    Generate documentation using AI based on the schema.

    Uses existing DDL to generate comprehensive documentation.
    """
    from ..ai.generator import AIGenerator

    # Get existing DDL
    ddl = _get_database_ddl(tenant_id, database_id)
    if not ddl:
        return _error_response(400, "No DDL found. Please add schema definitions first.")

    existing_docs = _get_database_docs(tenant_id, database_id)
    table_name = data.get("table_name")  # Optional: focus on specific table

    try:
        generator = AIGenerator()
        documentation = generator.generate_documentation(
            ddl=ddl,
            table_name=table_name,
            existing_docs="\n---\n".join(existing_docs) if existing_docs else None,
        )

        # Optionally auto-save
        if data.get("auto_save", False):
            aurora = get_aurora_client()
            embedding = generate_embedding(documentation)
            result = aurora.query_one(
                """
                INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
                VALUES (:tenant_id::uuid, :database_id::uuid, :documentation, :embedding::vector)
                RETURNING id
                """,
                [
                    param("tenant_id", tenant_id, "UUID"),
                    param("database_id", database_id, "UUID"),
                    param("documentation", documentation),
                    param("embedding", json.dumps(embedding)),
                ]
            )
            return _success_response({
                "documentation": documentation,
                "saved": True,
                "id": result["id"],
            })

        return _success_response({
            "documentation": documentation,
            "saved": False,
        })

    except Exception as e:
        logger.exception(f"Failed to generate documentation: {e}")
        return _error_response(500, f"AI generation failed: {str(e)}")


def _ai_generate_examples(tenant_id: str, database_id: str, data: dict) -> dict:
    """
    Generate sample SQL queries using AI.

    Creates practical example queries based on the schema.
    """
    from ..ai.generator import AIGenerator

    # Get existing DDL
    ddl = _get_database_ddl(tenant_id, database_id)
    if not ddl:
        return _error_response(400, "No DDL found. Please add schema definitions first.")

    num_queries = data.get("count", 5)
    context = data.get("context")  # Optional business context

    try:
        generator = AIGenerator()
        examples = generator.generate_sample_queries(
            ddl=ddl,
            num_queries=num_queries,
            context=context,
        )

        # Optionally auto-save all examples
        if data.get("auto_save", False) and examples:
            aurora = get_aurora_client()
            saved_ids = []

            for example in examples:
                embedding = generate_embedding(example["question"])
                result = aurora.query_one(
                    """
                    INSERT INTO db_question_sql (tenant_id, database_id, question, sql, embedding)
                    VALUES (:tenant_id::uuid, :database_id::uuid, :question, :sql, :embedding::vector)
                    RETURNING id
                    """,
                    [
                        param("tenant_id", tenant_id, "UUID"),
                        param("database_id", database_id, "UUID"),
                        param("question", example["question"]),
                        param("sql", example["sql"]),
                        param("embedding", json.dumps(embedding)),
                    ]
                )
                saved_ids.append(result["id"])

            return _success_response({
                "examples": examples,
                "saved": True,
                "saved_ids": saved_ids,
            })

        return _success_response({
            "examples": examples,
            "saved": False,
        })

    except Exception as e:
        logger.exception(f"Failed to generate examples: {e}")
        return _error_response(500, f"AI generation failed: {str(e)}")


def _ai_analyze_schema(tenant_id: str, database_id: str) -> dict:
    """
    Analyze the schema and provide insights.

    Returns analysis including relationships, suggestions, and patterns.
    """
    from ..ai.generator import AIGenerator

    # Get existing DDL
    ddl = _get_database_ddl(tenant_id, database_id)
    if not ddl:
        return _error_response(400, "No DDL found. Please add schema definitions first.")

    existing_docs = _get_database_docs(tenant_id, database_id)

    try:
        generator = AIGenerator()

        # Get schema analysis
        analysis = generator.analyze_schema(ddl)

        # Get documentation suggestions
        suggestions = generator.suggest_documentation(ddl, existing_docs)

        return _success_response({
            "analysis": analysis,
            "documentation_suggestions": suggestions,
        })

    except Exception as e:
        logger.exception(f"Failed to analyze schema: {e}")
        return _error_response(500, f"AI analysis failed: {str(e)}")


# =============================================================================
# User Management
# =============================================================================

def _list_users(tenant_id: str) -> dict:
    """List users in the tenant."""
    aurora = get_aurora_client()
    users = aurora.query(
        """
        SELECT id, email, name, role, scopes, is_active, created_at, last_login_at
        FROM users
        WHERE tenant_id = :tenant_id::uuid
        ORDER BY created_at
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )
    return _success_response({"users": users})


def _create_user(tenant_id: str, data: dict) -> dict:
    """Create a new user in the tenant."""
    import bcrypt

    email = data.get("email")
    password = data.get("password")
    name = data.get("name")
    role = data.get("role", "member")
    scopes = data.get("scopes", ["read", "write"])

    if not email or not password:
        return _error_response(400, "email and password are required")

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    aurora = get_aurora_client()

    try:
        result = aurora.query_one(
            """
            INSERT INTO users (tenant_id, email, password_hash, name, role, scopes)
            VALUES (:tenant_id::uuid, :email, :password_hash, :name, :role, :scopes)
            RETURNING id, email, name, role, scopes, created_at
            """,
            [
                param("tenant_id", tenant_id, "UUID"),
                param("email", email),
                param("password_hash", password_hash),
                param("name", name),
                param("role", role),
                param("scopes", scopes),
            ]
        )
        return _success_response(result, 201)
    except Exception as e:
        if "duplicate" in str(e).lower():
            return _error_response(409, "User with this email already exists")
        raise


def _update_user(tenant_id: str, user_id: str, data: dict) -> dict:
    """Update user details."""
    aurora = get_aurora_client()

    updates = []
    params = [
        param("id", user_id, "UUID"),
        param("tenant_id", tenant_id, "UUID"),
    ]

    if "name" in data:
        updates.append("name = :name")
        params.append(param("name", data["name"]))

    if "role" in data:
        updates.append("role = :role")
        params.append(param("role", data["role"]))

    if "scopes" in data:
        updates.append("scopes = :scopes")
        params.append(param("scopes", data["scopes"]))

    if "is_active" in data:
        updates.append("is_active = :is_active")
        params.append(param("is_active", data["is_active"]))

    if not updates:
        return _error_response(400, "No fields to update")

    result = aurora.query_one(
        f"""
        UPDATE users
        SET {", ".join(updates)}, updated_at = NOW()
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        RETURNING id, email, name, role, scopes, is_active
        """,
        params
    )

    if not result:
        return _error_response(404, "User not found")

    return _success_response(result)


def _delete_user(tenant_id: str, current_user_id: str, target_user_id: str) -> dict:
    """Delete a user (cannot delete yourself)."""
    if current_user_id == target_user_id:
        return _error_response(400, "Cannot delete yourself")

    aurora = get_aurora_client()
    result = aurora.query_one(
        """
        DELETE FROM users
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid
        RETURNING id
        """,
        [
            param("id", target_user_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "User not found")

    return _success_response({"deleted": True})


# =============================================================================
# Response Helpers
# =============================================================================

def _success_response(data: Any, status_code: int = 200) -> dict:
    """Create success response."""
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data, default=str),
    }


def _error_response(status_code: int, message: str) -> dict:
    """Create error response."""
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }
