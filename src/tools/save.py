"""Save pattern and business context tools."""

import logging
from typing import Any

from ..db.memory import get_memory
from ..mcp.protocol import text_content, create_tool_result
from .context import get_context, get_database_id

logger = logging.getLogger(__name__)


def save_sql_pattern(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Save a successful question-SQL pattern for future RAG retrieval.

    This helps improve SQL generation accuracy over time by learning
    from successful queries.
    """
    question = arguments.get("question", "")
    sql = arguments.get("sql", "")
    database_name = arguments.get("database")

    if not question:
        return create_tool_result(
            [text_content("Error: question is required")],
            is_error=True,
        )

    if not sql:
        return create_tool_result(
            [text_content("Error: sql is required")],
            is_error=True,
        )

    # Get database ID
    database_id = get_context("database_id")
    if not database_id:
        database_id = get_database_id(tenant_id, database_name)

    if not database_id:
        return create_tool_result(
            [text_content("Error: No database found for this tenant")],
            is_error=True,
        )

    try:
        memory = get_memory(tenant_id, database_id)

        # Save as tool memory
        memory_id = memory.save_tool_memory(
            question=question,
            tool_name="execute_sql",
            tool_args={"sql": sql},
            success=True,
            metadata={"saved_by": user_id},
        )

        if memory_id:
            return create_tool_result([
                text_content(
                    f"Successfully saved SQL pattern. "
                    f"This pattern will be used to help answer similar questions in the future."
                )
            ])
        else:
            return create_tool_result([
                text_content(
                    "Pattern was not saved (may be a duplicate of an existing pattern)."
                )
            ])

    except Exception as e:
        logger.exception(f"Failed to save pattern: {e}")
        return create_tool_result(
            [text_content(f"Error saving pattern: {e}")],
            is_error=True,
        )


def save_business_context(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Save business context or domain knowledge for future reference.

    This helps improve SQL generation by providing business rules,
    terminology, and domain-specific information.
    """
    content = arguments.get("content", "")
    database_name = arguments.get("database")

    if not content:
        return create_tool_result(
            [text_content("Error: content is required")],
            is_error=True,
        )

    # Get database ID
    database_id = get_context("database_id")
    if not database_id:
        database_id = get_database_id(tenant_id, database_name)

    if not database_id:
        return create_tool_result(
            [text_content("Error: No database found for this tenant")],
            is_error=True,
        )

    try:
        memory = get_memory(tenant_id, database_id)

        # Save as text memory
        memory_id = memory.save_text_memory(content=content)

        if memory_id:
            return create_tool_result([
                text_content(
                    f"Successfully saved business context. "
                    f"This information will be used to help answer future queries."
                )
            ])
        else:
            return create_tool_result([
                text_content(
                    "Content was not saved (may be a duplicate of existing context)."
                )
            ])

    except Exception as e:
        logger.exception(f"Failed to save context: {e}")
        return create_tool_result(
            [text_content(f"Error saving context: {e}")],
            is_error=True,
        )
