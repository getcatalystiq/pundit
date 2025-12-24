"""List databases tool."""

import logging
from typing import Any

from ..db.connections import get_connection_manager
from ..mcp.protocol import text_content, create_tool_result

logger = logging.getLogger(__name__)


def list_databases(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    List all available database connections for this tenant.
    """
    try:
        manager = get_connection_manager()
        databases = manager.list_databases(tenant_id)

        if not databases:
            return create_tool_result([
                text_content(
                    "No databases configured for this tenant. "
                    "Please add a database connection through the admin interface."
                )
            ])

        # Format as list
        lines = ["**Available Databases:**\n"]

        for db in databases:
            status = "✓" if db.get("enabled") else "✗"
            default = " (default)" if db.get("is_default") else ""
            lines.append(
                f"- {status} **{db['name']}** ({db['db_type']}){default}"
            )

        return create_tool_result([
            text_content("\n".join(lines))
        ])

    except Exception as e:
        logger.exception(f"Failed to list databases: {e}")
        return create_tool_result(
            [text_content(f"Error listing databases: {e}")],
            is_error=True,
        )
