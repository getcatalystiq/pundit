"""Visualize data tool with Kaleido for Base64 PNG rendering."""

import base64
import logging
from io import BytesIO
from typing import Any, Optional

from ..mcp.protocol import text_content, image_content, create_tool_result
from .context import get_query_result

logger = logging.getLogger(__name__)


def visualize_data(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Generate a chart visualization from the last query results.

    Uses Plotly for chart generation and Kaleido to render to PNG.
    Returns base64-encoded image that Claude can display inline.
    """
    chart_type = arguments.get("chart_type", "bar")
    x_column = arguments.get("x_column")
    y_column = arguments.get("y_column")
    title = arguments.get("title", "Chart")
    color_column = arguments.get("color_column")

    if not x_column or not y_column:
        return create_tool_result(
            [text_content("Error: x_column and y_column are required")],
            is_error=True,
        )

    # Get last query results
    data, columns = get_query_result()

    if not data:
        return create_tool_result(
            [text_content(
                "Error: No query data available. "
                "Run execute_sql first to get data for visualization."
            )],
            is_error=True,
        )

    # Validate columns exist
    if x_column not in columns:
        return create_tool_result(
            [text_content(f"Error: Column '{x_column}' not found. Available: {columns}")],
            is_error=True,
        )

    if y_column not in columns:
        return create_tool_result(
            [text_content(f"Error: Column '{y_column}' not found. Available: {columns}")],
            is_error=True,
        )

    if color_column and color_column not in columns:
        return create_tool_result(
            [text_content(f"Error: Color column '{color_column}' not found. Available: {columns}")],
            is_error=True,
        )

    try:
        # Generate chart
        image_base64 = _generate_chart(
            data=data,
            chart_type=chart_type,
            x_column=x_column,
            y_column=y_column,
            title=title,
            color_column=color_column,
        )

        return create_tool_result([
            text_content(f"Generated {chart_type} chart: {title}"),
            image_content(image_base64, "image/png"),
        ])

    except ImportError as e:
        logger.warning(f"Visualization dependencies not available: {e}")
        return create_tool_result(
            [text_content(
                "Chart rendering is not available. "
                "Install plotly and kaleido packages."
            )],
            is_error=True,
        )
    except Exception as e:
        logger.exception(f"Chart generation failed: {e}")
        return create_tool_result(
            [text_content(f"Error generating chart: {e}")],
            is_error=True,
        )


def _generate_chart(
    data: list[dict],
    chart_type: str,
    x_column: str,
    y_column: str,
    title: str,
    color_column: Optional[str] = None,
) -> str:
    """
    Generate chart using Plotly and render to base64 PNG with Kaleido.

    Args:
        data: List of row dicts
        chart_type: Type of chart (bar, line, pie, scatter, area, histogram)
        x_column: X axis column
        y_column: Y axis column
        title: Chart title
        color_column: Optional color grouping column

    Returns:
        Base64-encoded PNG image
    """
    import plotly.express as px
    import plotly.graph_objects as go
    import pandas as pd

    # Convert to DataFrame
    df = pd.DataFrame(data)

    # Chart configuration
    chart_config = {
        "x": x_column,
        "y": y_column,
        "title": title,
    }

    if color_column:
        chart_config["color"] = color_column

    # Generate chart based on type
    if chart_type == "bar":
        fig = px.bar(df, **chart_config)
    elif chart_type == "line":
        fig = px.line(df, **chart_config)
    elif chart_type == "pie":
        # Pie chart uses names and values instead of x/y
        fig = px.pie(df, names=x_column, values=y_column, title=title)
    elif chart_type == "scatter":
        fig = px.scatter(df, **chart_config)
    elif chart_type == "area":
        fig = px.area(df, **chart_config)
    elif chart_type == "histogram":
        fig = px.histogram(df, x=x_column, title=title)
        if color_column:
            fig = px.histogram(df, x=x_column, color=color_column, title=title)
    else:
        raise ValueError(f"Unsupported chart type: {chart_type}")

    # Style the chart
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Arial, sans-serif", size=12),
        title=dict(font=dict(size=16)),
        margin=dict(l=50, r=50, t=60, b=50),
    )

    # Render to PNG bytes using Kaleido
    img_bytes = fig.to_image(format="png", width=800, height=500, scale=2)

    # Encode to base64
    return base64.b64encode(img_bytes).decode("utf-8")


def suggest_visualization(data: list[dict], columns: list[str]) -> dict[str, Any]:
    """
    Suggest appropriate visualization based on data characteristics.

    Args:
        data: Query result data
        columns: Column names

    Returns:
        Suggested chart configuration
    """
    if not data or not columns:
        return {"chart_type": "bar", "x_column": None, "y_column": None}

    # Analyze columns
    sample_row = data[0]
    numeric_cols = []
    categorical_cols = []
    date_cols = []

    for col in columns:
        val = sample_row.get(col)
        if val is None:
            continue

        # Check if numeric
        if isinstance(val, (int, float)):
            numeric_cols.append(col)
        # Check if date-like string
        elif isinstance(val, str) and any(d in col.lower() for d in ["date", "time", "month", "year"]):
            date_cols.append(col)
        else:
            categorical_cols.append(col)

    # Suggest based on data shape
    num_rows = len(data)

    # Time series
    if date_cols and numeric_cols:
        return {
            "chart_type": "line",
            "x_column": date_cols[0],
            "y_column": numeric_cols[0],
        }

    # Small categorical data -> pie
    if categorical_cols and numeric_cols and num_rows <= 10:
        return {
            "chart_type": "pie",
            "x_column": categorical_cols[0],
            "y_column": numeric_cols[0],
        }

    # Large numeric data -> scatter
    if len(numeric_cols) >= 2 and num_rows > 20:
        return {
            "chart_type": "scatter",
            "x_column": numeric_cols[0],
            "y_column": numeric_cols[1],
        }

    # Default to bar
    x_col = categorical_cols[0] if categorical_cols else columns[0]
    y_col = numeric_cols[0] if numeric_cols else columns[1] if len(columns) > 1 else columns[0]

    return {
        "chart_type": "bar",
        "x_column": x_col,
        "y_column": y_col,
    }
