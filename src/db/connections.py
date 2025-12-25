"""
Tenant database connection management.

SECURITY: Connections are only created AFTER OAuth token validation.
Credentials are retrieved just-in-time from Secrets Manager.
"""

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Optional

from .aurora import get_aurora_client, param
from utils.secrets import get_tenant_db_credentials

logger = logging.getLogger(__name__)


@dataclass
class DatabaseConfig:
    """Configuration for a tenant's database connection."""

    id: str
    tenant_id: str
    name: str
    db_type: str
    connection_config: dict
    credentials_secret_arn: Optional[str]
    is_default: bool
    enabled: bool


@dataclass
class QueryResult:
    """Result of a SQL query execution."""

    data: list[dict[str, Any]]
    columns: list[str]
    row_count: int
    execution_time_ms: float
    truncated: bool = False

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            "data": self.data,
            "columns": self.columns,
            "row_count": self.row_count,
            "execution_time_ms": self.execution_time_ms,
            "truncated": self.truncated,
        }


def sanitize_value(value: Any) -> Any:
    """Convert database types to JSON-serializable Python types."""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def sanitize_row(row: dict) -> dict:
    """Sanitize a row dictionary for JSON serialization."""
    return {k: sanitize_value(v) for k, v in row.items()}


class TenantDatabaseConnection:
    """
    Database connection for tenant's external database.

    Supports: PostgreSQL, MySQL, Snowflake, BigQuery, SQLite
    """

    def __init__(
        self,
        db_type: str,
        connection_config: dict,
        credentials: dict,
    ):
        self.db_type = db_type
        self.connection_config = connection_config
        self.credentials = credentials
        self._connection = None

    def _create_connection(self):
        """Create database connection based on type."""
        if self.db_type == "postgresql":
            import psycopg2

            return psycopg2.connect(
                host=self.connection_config.get("host", self.credentials.get("host")),
                port=self.connection_config.get("port", self.credentials.get("port", 5432)),
                database=self.connection_config.get("database", self.credentials.get("database")),
                user=self.credentials.get("username", self.credentials.get("user")),
                password=self.credentials.get("password"),
            )

        elif self.db_type == "mysql":
            import pymysql

            return pymysql.connect(
                host=self.connection_config.get("host", self.credentials.get("host")),
                port=self.connection_config.get("port", self.credentials.get("port", 3306)),
                database=self.connection_config.get("database", self.credentials.get("database")),
                user=self.credentials.get("username", self.credentials.get("user")),
                password=self.credentials.get("password"),
                cursorclass=pymysql.cursors.DictCursor,
            )

        elif self.db_type == "snowflake":
            import snowflake.connector

            return snowflake.connector.connect(
                account=self.connection_config.get("account", self.credentials.get("account")),
                user=self.credentials.get("username", self.credentials.get("user")),
                password=self.credentials.get("password"),
                database=self.connection_config.get("database", self.credentials.get("database")),
                warehouse=self.connection_config.get("warehouse", self.credentials.get("warehouse")),
                schema=self.connection_config.get("schema", "PUBLIC"),
            )

        elif self.db_type == "bigquery":
            from google.cloud import bigquery
            from google.oauth2 import service_account
            import tempfile

            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(self.credentials, f)
                cred_path = f.name

            credentials = service_account.Credentials.from_service_account_file(cred_path)
            project_id = self.connection_config.get("project_id", self.credentials.get("project_id"))
            return bigquery.Client(credentials=credentials, project=project_id)

        elif self.db_type == "sqlite":
            import sqlite3

            db_path = self.connection_config.get("database_path", ":memory:")
            return sqlite3.connect(db_path)

        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

    @property
    def connection(self):
        """Lazy-load database connection."""
        if self._connection is None:
            self._connection = self._create_connection()
        return self._connection

    def execute_sql(self, sql: str, max_rows: int = 1000) -> QueryResult:
        """Execute SQL query and return results."""
        start_time = time.time()

        try:
            if self.db_type == "bigquery":
                result = self._execute_bigquery(sql, max_rows)
            else:
                result = self._execute_standard(sql, max_rows)

            result.execution_time_ms = (time.time() - start_time) * 1000
            return result

        except Exception as e:
            logger.exception(f"SQL execution failed: {e}")
            raise

    def _execute_standard(self, sql: str, max_rows: int) -> QueryResult:
        """Execute SQL using standard DB-API 2.0 cursor."""
        cursor = self.connection.cursor()
        cursor.execute(sql)

        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchmany(max_rows + 1)
        truncated = len(rows) > max_rows
        if truncated:
            rows = rows[:max_rows]

        if self.db_type == "mysql":
            data = [sanitize_row(row) for row in rows]
        else:
            data = [sanitize_row(dict(zip(columns, row))) for row in rows]

        cursor.close()

        return QueryResult(
            data=data,
            columns=columns,
            row_count=len(data),
            execution_time_ms=0,
            truncated=truncated,
        )

    def _execute_bigquery(self, sql: str, max_rows: int) -> QueryResult:
        """Execute SQL using BigQuery client."""
        query_job = self.connection.query(sql)
        results = query_job.result()

        columns = [field.name for field in results.schema]
        data = []
        for i, row in enumerate(results):
            if i >= max_rows:
                break
            data.append(sanitize_row(dict(row)))

        truncated = results.total_rows > max_rows if results.total_rows else False

        return QueryResult(
            data=data,
            columns=columns,
            row_count=len(data),
            execution_time_ms=0,
            truncated=truncated,
        )

    def close(self):
        """Close the database connection."""
        if self._connection is not None:
            try:
                self._connection.close()
            except Exception:
                pass
            self._connection = None


class TenantConnectionManager:
    """
    Manages database connections for tenants.

    SECURITY: All methods require validated token claims.
    Connections are created just-in-time and not cached.
    """

    def get_database_config(
        self,
        tenant_id: str,
        database_name: Optional[str] = None,
    ) -> Optional[DatabaseConfig]:
        """
        Load database configuration from Aurora.

        Args:
            tenant_id: Tenant ID (from validated JWT)
            database_name: Optional database name (uses default if not specified)

        Returns:
            DatabaseConfig or None if not found
        """
        aurora = get_aurora_client()

        if database_name:
            result = aurora.query_one(
                """
                SELECT id, tenant_id, name, db_type, connection_config,
                       credentials_secret_arn, is_default, enabled
                FROM tenant_databases
                WHERE tenant_id = :tenant_id::uuid
                  AND name = :name
                """,
                [
                    param("tenant_id", tenant_id, "UUID"),
                    param("name", database_name),
                ],
            )
        else:
            # Get default database
            result = aurora.query_one(
                """
                SELECT id, tenant_id, name, db_type, connection_config,
                       credentials_secret_arn, is_default, enabled
                FROM tenant_databases
                WHERE tenant_id = :tenant_id::uuid
                  AND is_default = TRUE
                """,
                [param("tenant_id", tenant_id, "UUID")],
            )

            # Fallback to any enabled database
            if not result:
                result = aurora.query_one(
                    """
                    SELECT id, tenant_id, name, db_type, connection_config,
                           credentials_secret_arn, is_default, enabled
                    FROM tenant_databases
                    WHERE tenant_id = :tenant_id::uuid
                      AND enabled = TRUE
                    LIMIT 1
                    """,
                    [param("tenant_id", tenant_id, "UUID")],
                )

        if not result:
            return None

        # Parse connection_config if it's a string
        connection_config = result.get("connection_config", {})
        if isinstance(connection_config, str):
            connection_config = json.loads(connection_config)

        return DatabaseConfig(
            id=result["id"],
            tenant_id=result["tenant_id"],
            name=result["name"],
            db_type=result["db_type"],
            connection_config=connection_config,
            credentials_secret_arn=result.get("credentials_secret_arn"),
            is_default=result.get("is_default", False),
            enabled=result.get("enabled", True),
        )

    def create_connection(
        self,
        tenant_id: str,
        database_name: Optional[str] = None,
    ) -> TenantDatabaseConnection:
        """
        Create a database connection for a tenant.

        SECURITY: This should only be called AFTER OAuth token validation.
        Credentials are fetched just-in-time from Secrets Manager.

        Args:
            tenant_id: Tenant ID (from validated JWT)
            database_name: Optional database name

        Returns:
            TenantDatabaseConnection ready to execute queries

        Raises:
            ValueError: If database not found or disabled
        """
        db_config = self.get_database_config(tenant_id, database_name)

        if not db_config:
            raise ValueError(
                f"No database configured for tenant {tenant_id}"
                + (f" with name '{database_name}'" if database_name else " (no default)")
            )

        if not db_config.enabled:
            raise ValueError(f"Database '{db_config.name}' is disabled")

        if not db_config.credentials_secret_arn:
            raise ValueError(f"No credentials configured for database '{db_config.name}'")

        # Fetch credentials just-in-time
        credentials = get_tenant_db_credentials(db_config.credentials_secret_arn)

        return TenantDatabaseConnection(
            db_type=db_config.db_type,
            connection_config=db_config.connection_config,
            credentials=credentials,
        )

    def list_databases(self, tenant_id: str) -> list[dict[str, Any]]:
        """List all databases configured for a tenant."""
        aurora = get_aurora_client()

        return aurora.query(
            """
            SELECT id, name, db_type, is_default, enabled
            FROM tenant_databases
            WHERE tenant_id = :tenant_id::uuid
            ORDER BY name
            """,
            [param("tenant_id", tenant_id, "UUID")],
        )


# Singleton manager instance
_connection_manager: Optional[TenantConnectionManager] = None


def get_connection_manager() -> TenantConnectionManager:
    """Get or create connection manager singleton."""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = TenantConnectionManager()
    return _connection_manager


def create_tenant_connection(
    tenant_id: str,
    database_name: Optional[str] = None,
) -> TenantDatabaseConnection:
    """Convenience function to create a tenant database connection."""
    manager = get_connection_manager()
    return manager.create_connection(tenant_id, database_name)
