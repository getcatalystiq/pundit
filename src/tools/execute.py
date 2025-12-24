"""Execute SQL tool."""

import logging
from typing import Any

from ..db.connections import create_tenant_connection
from ..mcp.protocol import text_content, create_tool_result
from .context import set_context, set_query_result, get_context

logger = logging.getLogger(__name__)


def execute_sql(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Execute a SQL query against the tenant's database.

    Returns results as formatted text with data stored for visualization.
    """
    sql = arguments.get("sql", "").strip()
    database_name = arguments.get("database")
    max_rows = arguments.get("max_rows", 100)

    if not sql:
        return create_tool_result(
            [text_content("Error: sql is required")],
            is_error=True,
        )

    # Basic SQL validation
    sql_upper = sql.upper()

    # Block dangerous operations
    dangerous_keywords = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER ", "CREATE ", "INSERT ", "UPDATE "]
    for keyword in dangerous_keywords:
        if keyword in sql_upper:
            return create_tool_result(
                [text_content(
                    f"Error: {keyword.strip()} statements are not allowed. "
                    "Only SELECT queries are permitted."
                )],
                is_error=True,
            )

    # Must be a SELECT query
    if not sql_upper.lstrip().startswith("SELECT"):
        return create_tool_result(
            [text_content("Error: Only SELECT queries are allowed.")],
            is_error=True,
        )

    connection = None
    try:
        # Create connection (credentials fetched just-in-time)
        connection = create_tenant_connection(tenant_id, database_name)

        # Execute query
        result = connection.execute_sql(sql, max_rows=max_rows)

        # Store results for visualization
        set_query_result(result.data, result.columns)
        set_context("last_sql", sql)
        set_context("last_query_success", True)

        # Format results as markdown table
        if not result.data:
            return create_tool_result([
                text_content("Query executed successfully. No rows returned.")
            ])

        # Build markdown table
        table_lines = []

        # Header
        table_lines.append("| " + " | ".join(result.columns) + " |")
        table_lines.append("| " + " | ".join(["---"] * len(result.columns)) + " |")

        # Rows (limit display to 50 rows, full data stored for viz)
        display_rows = result.data[:50]
        for row in display_rows:
            values = [str(row.get(col, ""))[:50] for col in result.columns]  # Truncate long values
            table_lines.append("| " + " | ".join(values) + " |")

        table = "\n".join(table_lines)

        # Build summary
        summary_parts = [
            f"**Query Results** ({result.row_count} rows",
        ]
        if result.truncated:
            summary_parts.append(f", truncated from more")
        summary_parts.append(f", {result.execution_time_ms:.0f}ms)")

        if len(result.data) > 50:
            summary_parts.append(f"\n*Showing first 50 of {result.row_count} rows*")

        summary = "".join(summary_parts)

        return create_tool_result([
            text_content(f"{summary}\n\n{table}")
        ])

    except ValueError as e:
        logger.warning(f"Database config error: {e}")
        return create_tool_result(
            [text_content(f"Error: {e}")],
            is_error=True,
        )
    except Exception as e:
        logger.exception(f"SQL execution failed: {e}")
        set_context("last_query_success", False)
        return create_tool_result(
            [text_content(f"SQL Error: {e}")],
            is_error=True,
        )
    finally:
        if connection:
            connection.close()
