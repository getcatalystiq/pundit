"""Search database context tool."""

import logging
from typing import Any

from ..db.memory import get_memory
from ..mcp.protocol import text_content, create_tool_result
from .context import set_context, get_database_id

logger = logging.getLogger(__name__)


def search_database_context(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Search for relevant database context.

    Returns schema definitions, documentation, example queries, and past
    successful patterns that are relevant to the user's question.
    """
    question = arguments.get("question", "")
    database_name = arguments.get("database")

    if not question:
        return create_tool_result(
            [text_content("Error: question is required")],
            is_error=True,
        )

    # Get database ID
    database_id = get_database_id(tenant_id, database_name)
    if not database_id:
        db_msg = f" '{database_name}'" if database_name else ""
        return create_tool_result(
            [text_content(f"Error: No database{db_msg} found for this tenant")],
            is_error=True,
        )

    try:
        # Search training data with dynamic limits based on available data
        memory = get_memory(tenant_id, database_id)
        context = memory.search_training_data(
            query=question,
            use_dynamic_limits=True,  # Automatically adjust limits based on available training data
        )

        # Store context for generate_sql
        set_context("rag_context", context)
        set_context("question", question)
        set_context("database_id", database_id)

        if context.is_empty:
            return create_tool_result([
                text_content(
                    "No relevant context found in the training data. "
                    "You may need to add schema definitions and documentation "
                    "for this database."
                )
            ])

        # Format context as prompt sections
        prompt_text = context.to_prompt_sections()

        # Build summary
        summary_parts = []
        if context.ddl:
            summary_parts.append(f"{len(context.ddl)} schema definitions")
        if context.documentation:
            summary_parts.append(f"{len(context.documentation)} documentation entries")
        if context.examples:
            summary_parts.append(f"{len(context.examples)} example queries")
        if context.tool_memory:
            summary_parts.append(f"{len(context.tool_memory)} past successful patterns")
        if context.text_memory:
            summary_parts.append(f"{len(context.text_memory)} business context entries")

        summary = f"Found {', '.join(summary_parts)}.\n\n"

        return create_tool_result([
            text_content(summary + prompt_text)
        ])

    except Exception as e:
        logger.exception(f"Search failed: {e}")
        return create_tool_result(
            [text_content(f"Error searching database context: {e}")],
            is_error=True,
        )
