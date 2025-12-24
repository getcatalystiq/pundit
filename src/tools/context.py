"""Tool execution context management."""

from typing import Any, Optional

# Per-request context storage
_current_context: dict[str, Any] = {}
_last_query_data: list[dict] = []
_last_query_columns: list[str] = []


def set_context(key: str, value: Any) -> None:
    """Set a context value."""
    _current_context[key] = value


def get_context(key: str, default: Any = None) -> Any:
    """Get a context value."""
    return _current_context.get(key, default)


def set_query_result(data: list[dict], columns: list[str]) -> None:
    """Store the last query result for visualization."""
    global _last_query_data, _last_query_columns
    _last_query_data = data
    _last_query_columns = columns


def get_query_result() -> tuple[list[dict], list[str]]:
    """Get the last query result."""
    return _last_query_data, _last_query_columns


def clear_context() -> None:
    """Clear all context (call at start of each request)."""
    global _current_context, _last_query_data, _last_query_columns
    _current_context = {}
    _last_query_data = []
    _last_query_columns = []


def get_database_id(tenant_id: str, database_name: Optional[str] = None) -> Optional[str]:
    """Get database ID, resolving name to ID if needed."""
    from ..db.connections import get_connection_manager

    manager = get_connection_manager()
    config = manager.get_database_config(tenant_id, database_name)

    if config:
        return config.id
    return None
