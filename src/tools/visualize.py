"""Visualize data tool - generates chart images using Altair."""

import base64
import logging
import tempfile
from typing import Any, Optional
from uuid import uuid4

import altair as alt
import pandas as pd
import vl_convert as vlc

from mcp.protocol import create_tool_result, image_content, text_content
from .context import get_query_result

logger = logging.getLogger(__name__)


def visualize_data(
    arguments: dict,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Generate a chart visualization from the last query results.

    Returns a PNG image of the chart.
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

    data, columns = get_query_result()

    if not data:
        return create_tool_result(
            [text_content(
                "Error: No query data available. "
                "Run execute_sql first to get data for visualization."
            )],
            is_error=True,
        )

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
        df = pd.DataFrame(data)
        chart = _create_chart(
            df=df,
            chart_type=chart_type,
            x_column=x_column,
            y_column=y_column,
            title=title,
            color_column=color_column,
        )

        png_bytes = vlc.vegalite_to_png(vl_spec=chart.to_dict(), scale=2)
        png_base64 = base64.b64encode(png_bytes).decode("utf-8")

        # Save to temp file for easy access
        temp_path = f"/tmp/chart_{uuid4().hex[:8]}.png"
        with open(temp_path, "wb") as f:
            f.write(png_bytes)

        return create_tool_result([
            text_content(f"Chart saved to: {temp_path}"),
            image_content(png_base64, "image/png")
        ])

    except Exception as e:
        logger.exception(f"Chart generation failed: {e}")
        return create_tool_result(
            [text_content(f"Error generating chart: {e}")],
            is_error=True,
        )


def _create_chart(
    df: pd.DataFrame,
    chart_type: str,
    x_column: str,
    y_column: str,
    title: str,
    color_column: Optional[str] = None,
) -> alt.Chart:
    """Create an Altair chart based on the chart type."""
    base = alt.Chart(df).properties(title=title, width=600, height=400)

    x_enc = alt.X(x_column, axis=alt.Axis(labelAngle=-45))
    y_enc = alt.Y(y_column)
    color_enc = alt.Color(color_column) if color_column else alt.Undefined

    if chart_type == "bar":
        return base.mark_bar().encode(x=x_enc, y=y_enc, color=color_enc)

    elif chart_type == "line":
        return base.mark_line().encode(x=x_enc, y=y_enc, color=color_enc)

    elif chart_type == "scatter":
        return base.mark_circle(size=60).encode(x=x_enc, y=y_enc, color=color_enc)

    elif chart_type == "area":
        return base.mark_area().encode(x=x_enc, y=y_enc, color=color_enc)

    elif chart_type == "pie":
        return base.mark_arc().encode(theta=y_column, color=x_column)

    elif chart_type == "histogram":
        return base.mark_bar().encode(x=alt.X(x_column, bin=True), y="count()")

    else:
        return base.mark_bar().encode(x=x_enc, y=y_enc, color=color_enc)


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

    sample_row = data[0]
    numeric_cols = []
    categorical_cols = []
    date_cols = []

    for col in columns:
        val = sample_row.get(col)
        if val is None:
            continue

        if isinstance(val, (int, float)):
            numeric_cols.append(col)
        elif isinstance(val, str) and any(d in col.lower() for d in ["date", "time", "month", "year"]):
            date_cols.append(col)
        else:
            categorical_cols.append(col)

    num_rows = len(data)

    if date_cols and numeric_cols:
        return {
            "chart_type": "line",
            "x_column": date_cols[0],
            "y_column": numeric_cols[0],
        }

    if categorical_cols and numeric_cols and num_rows <= 10:
        return {
            "chart_type": "pie",
            "x_column": categorical_cols[0],
            "y_column": numeric_cols[0],
        }

    if len(numeric_cols) >= 2 and num_rows > 20:
        return {
            "chart_type": "scatter",
            "x_column": numeric_cols[0],
            "y_column": numeric_cols[1],
        }

    x_col = categorical_cols[0] if categorical_cols else columns[0]
    y_col = numeric_cols[0] if numeric_cols else columns[1] if len(columns) > 1 else columns[0]

    return {
        "chart_type": "bar",
        "x_column": x_col,
        "y_column": y_col,
    }
