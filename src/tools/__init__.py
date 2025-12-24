"""Database tools for MCP server."""

from .search import search_database_context
from .generate import generate_sql
from .execute import execute_sql
from .visualize import visualize_data
from .save import save_sql_pattern, save_business_context
from .list_db import list_databases

# Tools registry for MCP server
TOOLS_REGISTRY = {
    "search_database_context": {
        "description": "Search for relevant database context including schemas, documentation, and example queries. ALWAYS call this first before generating SQL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The natural language question about the data",
                },
                "database": {
                    "type": "string",
                    "description": "Optional database name (uses default if not specified)",
                },
            },
            "required": ["question"],
        },
        "handler": search_database_context,
        "required_scope": "read",
    },
    "generate_sql": {
        "description": "Generate SQL query based on a natural language question. Call search_database_context first to get relevant context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The natural language question to convert to SQL",
                },
                "database": {
                    "type": "string",
                    "description": "Optional database name",
                },
            },
            "required": ["question"],
        },
        "handler": generate_sql,
        "required_scope": "read",
    },
    "execute_sql": {
        "description": "Execute a SQL query against the database. Review the SQL carefully before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query to execute",
                },
                "database": {
                    "type": "string",
                    "description": "Optional database name",
                },
                "max_rows": {
                    "type": "integer",
                    "description": "Maximum rows to return (default: 100)",
                    "default": 100,
                },
            },
            "required": ["sql"],
        },
        "handler": execute_sql,
        "required_scope": "write",
    },
    "visualize_data": {
        "description": "Generate a chart visualization from the last query results. Call execute_sql first.",
        "input_schema": {
            "type": "object",
            "properties": {
                "chart_type": {
                    "type": "string",
                    "enum": ["bar", "line", "pie", "scatter", "area", "histogram"],
                    "description": "Type of chart to generate",
                },
                "x_column": {
                    "type": "string",
                    "description": "Column for X axis",
                },
                "y_column": {
                    "type": "string",
                    "description": "Column for Y axis",
                },
                "title": {
                    "type": "string",
                    "description": "Chart title",
                },
                "color_column": {
                    "type": "string",
                    "description": "Optional column for color grouping",
                },
            },
            "required": ["chart_type", "x_column", "y_column"],
        },
        "handler": visualize_data,
        "required_scope": "read",
    },
    "save_sql_pattern": {
        "description": "Save a successful question-SQL pattern for future reference. Call this after a query works correctly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The natural language question",
                },
                "sql": {
                    "type": "string",
                    "description": "The SQL query that answered it",
                },
                "database": {
                    "type": "string",
                    "description": "Optional database name",
                },
            },
            "required": ["question", "sql"],
        },
        "handler": save_sql_pattern,
        "required_scope": "write",
    },
    "save_business_context": {
        "description": "Save business context or domain knowledge for future reference.",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The business context or domain knowledge to save",
                },
                "database": {
                    "type": "string",
                    "description": "Optional database name",
                },
            },
            "required": ["content"],
        },
        "handler": save_business_context,
        "required_scope": "write",
    },
    "list_databases": {
        "description": "List all available database connections for this tenant.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
        "handler": list_databases,
        "required_scope": "read",
    },
}

__all__ = [
    "TOOLS_REGISTRY",
    "search_database_context",
    "generate_sql",
    "execute_sql",
    "visualize_data",
    "save_sql_pattern",
    "save_business_context",
    "list_databases",
]
