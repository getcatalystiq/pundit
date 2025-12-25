"""
Platform Admin API Handler.

IAM authenticated - platform operators with AWS credentials can manage all tenants.
Endpoints: /tenants/*, /metrics

Authentication: AWS IAM (SigV4)
Authorization: Full access to all tenants and resources
"""

import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from db.aurora import get_aurora_client, param
from db.embeddings import generate_embedding

logger = logging.getLogger(__name__)


def handler(event: dict, context: Any) -> dict:
    """
    Lambda handler for platform admin endpoints.

    IAM authentication is handled by API Gateway.
    If the request reaches this handler, the caller has valid AWS credentials.
    """
    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    path_params = event.get("pathParameters", {}) or {}
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

    # Get caller identity for audit logging
    request_context = event.get("requestContext", {})
    caller_identity = request_context.get("identity", {})
    caller_arn = caller_identity.get("userArn", "unknown")

    logger.info(f"Platform admin request: {http_method} {path} by {caller_arn}")

    try:
        # Route to handler
        # Metrics (platform-wide)
        if path == "/metrics" and http_method == "GET":
            return _get_platform_metrics()

        # Tenant management
        elif path == "/tenants" and http_method == "GET":
            return _list_tenants()
        elif path == "/tenants" and http_method == "POST":
            return _create_tenant(body_params, caller_arn)
        elif path.startswith("/tenants/") and "/databases" not in path and "/metrics" not in path:
            tenant_id = path_params.get("tenant_id")
            if http_method == "GET":
                return _get_tenant(tenant_id)
            elif http_method == "PUT":
                return _update_tenant(tenant_id, body_params)
            elif http_method == "DELETE":
                return _delete_tenant(tenant_id)

        # Tenant-specific metrics
        elif "/metrics" in path and http_method == "GET":
            tenant_id = path_params.get("tenant_id")
            return _get_tenant_metrics(tenant_id)

        # Database management
        elif "/databases" in path:
            tenant_id = path_params.get("tenant_id")
            database_id = path_params.get("database_id")

            if "/training" in path:
                # Training data management
                training_type = path_params.get("type")
                item_id = path_params.get("id")

                if http_method == "GET":
                    return _list_training_data(tenant_id, database_id)
                elif http_method == "POST":
                    return _add_training_data(tenant_id, database_id, body_params)
                elif http_method == "DELETE":
                    return _delete_training_data(tenant_id, database_id, training_type, item_id)
            else:
                # Database CRUD
                if database_id:
                    if http_method == "PUT":
                        return _update_database(tenant_id, database_id, body_params)
                    elif http_method == "DELETE":
                        return _delete_database(tenant_id, database_id)
                else:
                    if http_method == "GET":
                        return _list_databases(tenant_id)
                    elif http_method == "POST":
                        return _create_database(tenant_id, body_params)

        return _error_response(404, "Endpoint not found")

    except Exception as e:
        logger.exception(f"Platform admin error: {e}")
        return _error_response(500, str(e))


# =============================================================================
# Tenant Management
# =============================================================================

def _list_tenants() -> dict:
    """List all tenants with summary stats."""
    aurora = get_aurora_client()
    tenants = aurora.query(
        """
        SELECT
            t.id, t.name, t.slug, t.plan, t.is_active, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
            (SELECT COUNT(*) FROM tenant_databases WHERE tenant_id = t.id) as database_count,
            (SELECT COUNT(*) FROM oauth_clients WHERE tenant_id = t.id) as client_count
        FROM tenants t
        ORDER BY t.created_at DESC
        """
    )
    return _success_response({"tenants": tenants, "count": len(tenants)})


def _get_tenant(tenant_id: str) -> dict:
    """Get detailed tenant information."""
    aurora = get_aurora_client()

    tenant = aurora.query_one(
        """
        SELECT id, name, slug, plan, settings, is_active, created_at, updated_at
        FROM tenants
        WHERE id = :tenant_id::uuid
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    if not tenant:
        return _error_response(404, "Tenant not found")

    # Get related counts
    user_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM users WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    database_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM tenant_databases WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    client_count = aurora.query_one(
        "SELECT COUNT(*) as count FROM oauth_clients WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )

    tenant["stats"] = {
        "user_count": user_count["count"] if user_count else 0,
        "database_count": database_count["count"] if database_count else 0,
        "client_count": client_count["count"] if client_count else 0,
    }

    # Get recent activity
    recent_sessions = aurora.query(
        """
        SELECT COUNT(*) as count, DATE(created_at) as date
        FROM mcp_sessions
        WHERE tenant_id = :tenant_id::uuid AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )
    tenant["recent_sessions"] = recent_sessions

    return _success_response(tenant)


def _create_tenant(data: dict, caller_arn: str) -> dict:
    """Create a new tenant."""
    name = data.get("name")
    slug = data.get("slug")
    plan = data.get("plan", "free")
    settings = data.get("settings", {})

    if not name:
        return _error_response(400, "name is required")

    if not slug:
        # Generate slug from name
        slug = name.lower().replace(" ", "-").replace("_", "-")
        # Remove non-alphanumeric chars except hyphens
        slug = "".join(c for c in slug if c.isalnum() or c == "-")

    aurora = get_aurora_client()

    try:
        result = aurora.query_one(
            """
            INSERT INTO tenants (name, slug, plan, settings)
            VALUES (:name, :slug, :plan, :settings::jsonb)
            RETURNING id, name, slug, plan, is_active, created_at
            """,
            [
                param("name", name),
                param("slug", slug),
                param("plan", plan),
                param("settings", json.dumps(settings)),
            ]
        )

        logger.info(f"Tenant created: {result['id']} by {caller_arn}")
        return _success_response(result, 201)

    except Exception as e:
        if "duplicate" in str(e).lower():
            return _error_response(409, "Tenant with this slug already exists")
        raise


def _update_tenant(tenant_id: str, data: dict) -> dict:
    """Update tenant configuration."""
    aurora = get_aurora_client()

    updates = []
    params = [param("tenant_id", tenant_id, "UUID")]

    if "name" in data:
        updates.append("name = :name")
        params.append(param("name", data["name"]))

    if "plan" in data:
        updates.append("plan = :plan")
        params.append(param("plan", data["plan"]))

    if "settings" in data:
        updates.append("settings = :settings::jsonb")
        params.append(param("settings", json.dumps(data["settings"])))

    if "is_active" in data:
        updates.append("is_active = :is_active")
        params.append(param("is_active", data["is_active"]))

    if not updates:
        return _error_response(400, "No fields to update")

    result = aurora.query_one(
        f"""
        UPDATE tenants
        SET {", ".join(updates)}, updated_at = NOW()
        WHERE id = :tenant_id::uuid
        RETURNING id, name, slug, plan, is_active, updated_at
        """,
        params
    )

    if not result:
        return _error_response(404, "Tenant not found")

    return _success_response(result)


def _delete_tenant(tenant_id: str) -> dict:
    """Delete a tenant and all related data."""
    aurora = get_aurora_client()

    # Check if tenant exists
    tenant = aurora.query_one(
        "SELECT id, name FROM tenants WHERE id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )

    if not tenant:
        return _error_response(404, "Tenant not found")

    # Delete in order to respect foreign keys
    # Note: CASCADE should handle most of this, but being explicit
    aurora.execute(
        "DELETE FROM mcp_sessions WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM oauth_refresh_tokens WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM oauth_authorization_codes WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM oauth_clients WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM db_tool_memory WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM db_text_memory WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM db_question_sql WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM db_documentation WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM db_ddl WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM tenant_databases WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM users WHERE tenant_id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    aurora.execute(
        "DELETE FROM tenants WHERE id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )

    logger.warning(f"Tenant deleted: {tenant_id} ({tenant['name']})")
    return _success_response({"deleted": True, "tenant_name": tenant["name"]})


# =============================================================================
# Database Management
# =============================================================================

def _list_databases(tenant_id: str) -> dict:
    """List all databases for a tenant."""
    aurora = get_aurora_client()

    # Verify tenant exists
    tenant = aurora.query_one(
        "SELECT id FROM tenants WHERE id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    if not tenant:
        return _error_response(404, "Tenant not found")

    databases = aurora.query(
        """
        SELECT
            d.id, d.name, d.db_type, d.is_default, d.enabled, d.created_at, d.updated_at,
            (SELECT COUNT(*) FROM db_ddl WHERE database_id = d.id) as ddl_count,
            (SELECT COUNT(*) FROM db_documentation WHERE database_id = d.id) as doc_count,
            (SELECT COUNT(*) FROM db_question_sql WHERE database_id = d.id) as example_count
        FROM tenant_databases d
        WHERE d.tenant_id = :tenant_id::uuid
        ORDER BY d.name
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )
    return _success_response({"databases": databases})


def _create_database(tenant_id: str, data: dict) -> dict:
    """Create a new database connection for a tenant."""
    name = data.get("name")
    db_type = data.get("db_type")
    connection_config = data.get("connection_config", {})
    credentials_secret_arn = data.get("credentials_secret_arn")
    is_default = data.get("is_default", False)

    if not name or not db_type:
        return _error_response(400, "name and db_type are required")

    aurora = get_aurora_client()

    # Verify tenant exists
    tenant = aurora.query_one(
        "SELECT id FROM tenants WHERE id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    if not tenant:
        return _error_response(404, "Tenant not found")

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

    # Build update query
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
        RETURNING id, name
        """,
        [
            param("id", database_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, "Database not found")

    return _success_response({"deleted": True, "database_name": result["name"]})


# =============================================================================
# Training Data Management
# =============================================================================

def _list_training_data(tenant_id: str, database_id: str) -> dict:
    """List all training data for a database."""
    aurora = get_aurora_client()

    # Get DDL entries
    ddl = aurora.query(
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

    # Get documentation
    docs = aurora.query(
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

    # Get examples
    examples = aurora.query(
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

    return _success_response({
        "ddl": ddl,
        "documentation": docs,
        "examples": examples,
        "counts": {
            "ddl": len(ddl),
            "documentation": len(docs),
            "examples": len(examples),
        }
    })


def _add_training_data(tenant_id: str, database_id: str, data: dict) -> dict:
    """Add training data entry."""
    data_type = data.get("type")

    if data_type == "ddl":
        return _add_ddl(tenant_id, database_id, data.get("ddl"))
    elif data_type == "documentation":
        return _add_documentation(tenant_id, database_id, data.get("documentation"))
    elif data_type == "example":
        return _add_example(tenant_id, database_id, data.get("question"), data.get("sql"))
    else:
        return _error_response(400, "type must be one of: ddl, documentation, example")


def _add_ddl(tenant_id: str, database_id: str, ddl: str) -> dict:
    """Add DDL entry with embedding."""
    if not ddl:
        return _error_response(400, "ddl content is required")

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

    return _success_response({"id": result["id"], "type": "ddl", "created_at": result["created_at"]}, 201)


def _add_documentation(tenant_id: str, database_id: str, documentation: str) -> dict:
    """Add documentation entry with embedding."""
    if not documentation:
        return _error_response(400, "documentation content is required")

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

    return _success_response({"id": result["id"], "type": "documentation", "created_at": result["created_at"]}, 201)


def _add_example(tenant_id: str, database_id: str, question: str, sql: str) -> dict:
    """Add example query with embedding."""
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

    return _success_response({"id": result["id"], "type": "example", "created_at": result["created_at"]}, 201)


def _delete_training_data(tenant_id: str, database_id: str, data_type: str, item_id: str) -> dict:
    """Delete training data entry."""
    aurora = get_aurora_client()

    if data_type == "ddl":
        table = "db_ddl"
    elif data_type == "documentation":
        table = "db_documentation"
    elif data_type == "example":
        table = "db_question_sql"
    else:
        return _error_response(400, "Invalid training data type")

    result = aurora.query_one(
        f"""
        DELETE FROM {table}
        WHERE id = :id::uuid AND tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid
        RETURNING id
        """,
        [
            param("id", item_id, "UUID"),
            param("tenant_id", tenant_id, "UUID"),
            param("database_id", database_id, "UUID"),
        ]
    )

    if not result:
        return _error_response(404, f"{data_type} entry not found")

    return _success_response({"deleted": True, "type": data_type})


# =============================================================================
# Metrics
# =============================================================================

def _get_platform_metrics() -> dict:
    """Get platform-wide metrics."""
    aurora = get_aurora_client()

    # Tenant counts
    tenant_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_tenants,
            COUNT(*) FILTER (WHERE is_active) as active_tenants,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_tenants_30d
        FROM tenants
        """
    )

    # User counts
    user_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_users,
            COUNT(*) FILTER (WHERE is_active) as active_users,
            COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_users_7d
        FROM users
        """
    )

    # Database counts
    db_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_databases,
            COUNT(*) FILTER (WHERE enabled) as enabled_databases
        FROM tenant_databases
        """
    )

    # Session counts
    session_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as sessions_24h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as sessions_7d
        FROM mcp_sessions
        """
    )

    # Training data counts
    training_stats = aurora.query_one(
        """
        SELECT
            (SELECT COUNT(*) FROM db_ddl) as total_ddl,
            (SELECT COUNT(*) FROM db_documentation) as total_documentation,
            (SELECT COUNT(*) FROM db_question_sql) as total_examples
        """
    )

    # Sessions by day (last 7 days)
    daily_sessions = aurora.query(
        """
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM mcp_sessions
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date
        """
    )

    # Top tenants by session count
    top_tenants = aurora.query(
        """
        SELECT
            t.name,
            t.id as tenant_id,
            COUNT(s.id) as session_count
        FROM tenants t
        LEFT JOIN mcp_sessions s ON s.tenant_id = t.id AND s.created_at > NOW() - INTERVAL '7 days'
        GROUP BY t.id, t.name
        ORDER BY session_count DESC
        LIMIT 10
        """
    )

    return _success_response({
        "tenants": tenant_stats or {},
        "users": user_stats or {},
        "databases": db_stats or {},
        "sessions": session_stats or {},
        "training_data": training_stats or {},
        "daily_sessions": daily_sessions,
        "top_tenants": top_tenants,
        "generated_at": datetime.utcnow().isoformat(),
    })


def _get_tenant_metrics(tenant_id: str) -> dict:
    """Get metrics for a specific tenant."""
    aurora = get_aurora_client()

    # Verify tenant exists
    tenant = aurora.query_one(
        "SELECT id, name FROM tenants WHERE id = :tenant_id::uuid",
        [param("tenant_id", tenant_id, "UUID")]
    )
    if not tenant:
        return _error_response(404, "Tenant not found")

    # User stats
    user_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_users,
            COUNT(*) FILTER (WHERE is_active) as active_users,
            COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_users_7d
        FROM users
        WHERE tenant_id = :tenant_id::uuid
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    # Database stats
    db_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_databases,
            COUNT(*) FILTER (WHERE enabled) as enabled_databases
        FROM tenant_databases
        WHERE tenant_id = :tenant_id::uuid
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    # Session stats
    session_stats = aurora.query_one(
        """
        SELECT
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as sessions_24h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as sessions_7d
        FROM mcp_sessions
        WHERE tenant_id = :tenant_id::uuid
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    # Training data stats per database
    training_by_db = aurora.query(
        """
        SELECT
            d.id as database_id,
            d.name as database_name,
            (SELECT COUNT(*) FROM db_ddl WHERE database_id = d.id) as ddl_count,
            (SELECT COUNT(*) FROM db_documentation WHERE database_id = d.id) as doc_count,
            (SELECT COUNT(*) FROM db_question_sql WHERE database_id = d.id) as example_count
        FROM tenant_databases d
        WHERE d.tenant_id = :tenant_id::uuid
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    # Sessions by day
    daily_sessions = aurora.query(
        """
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM mcp_sessions
        WHERE tenant_id = :tenant_id::uuid AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    # Top users by session count
    top_users = aurora.query(
        """
        SELECT
            u.email,
            u.name,
            COUNT(s.id) as session_count
        FROM users u
        LEFT JOIN mcp_sessions s ON s.user_id = u.id AND s.created_at > NOW() - INTERVAL '7 days'
        WHERE u.tenant_id = :tenant_id::uuid
        GROUP BY u.id, u.email, u.name
        ORDER BY session_count DESC
        LIMIT 10
        """,
        [param("tenant_id", tenant_id, "UUID")]
    )

    return _success_response({
        "tenant": tenant,
        "users": user_stats or {},
        "databases": db_stats or {},
        "sessions": session_stats or {},
        "training_by_database": training_by_db,
        "daily_sessions": daily_sessions,
        "top_users": top_users,
        "generated_at": datetime.utcnow().isoformat(),
    })


# =============================================================================
# Response Helpers
# =============================================================================

def _success_response(data: Any, status_code: int = 200) -> dict:
    """Create success response for REST API."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(data, default=str),
    }


def _error_response(status_code: int, message: str) -> dict:
    """Create error response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({"error": message}),
    }
