"""
AI-powered content generation using Claude via AWS Bedrock.

Generates database documentation, sample SQL queries, and analyzes schemas.
"""

import json
import logging
import os
from typing import Optional

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

# Bedrock configuration
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
# Use Opus 4.5 via global inference profile
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-opus-4-5-20251101-v1:0")

# Longer timeout for Opus 4.5 which can take several minutes
BEDROCK_CONFIG = Config(
    read_timeout=600,  # 10 minutes
    connect_timeout=10,
    retries={"max_attempts": 2}
)


class AIGenerator:
    """AI content generator using Claude via Bedrock."""

    def __init__(self):
        self.client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION, config=BEDROCK_CONFIG)

    def _invoke(self, prompt: str, max_tokens: int = 4096) -> str:
        """Invoke Claude via Bedrock."""
        logger.debug(f"Invoking model: {MODEL_ID}")
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }

        try:
            response = self.client.invoke_model(
                modelId=MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            logger.debug("Model invoked successfully")

            result = json.loads(response["body"].read())
            return result["content"][0]["text"]
        except Exception as e:
            logger.exception(f"Error invoking model: {type(e).__name__}: {e}")
            raise

    def generate_documentation(
        self,
        ddl: str,
        table_name: Optional[str] = None,
        existing_docs: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Generate documentation for database schema.

        Args:
            ddl: The DDL/schema definition
            table_name: Optional specific table to focus on
            existing_docs: Optional existing documentation to enhance

        Returns:
            Dict mapping table names to their documentation
        """
        prompt = f"""You are a database documentation expert. Generate clear, comprehensive documentation for the following database schema.

<schema>
{ddl}
</schema>

{f"Focus specifically on the table: {table_name}" if table_name else "Document each table separately."}

{f"Existing documentation to enhance:\n{existing_docs}" if existing_docs else ""}

For each table, generate documentation that includes:
1. **Purpose**: What this table is used for
2. **Columns**: Description of each column, its data type, and purpose
3. **Relationships**: Foreign keys and how this table relates to others
4. **Business Rules**: Any constraints, defaults, or important business logic
5. **Common Use Cases**: How this table's data is typically queried or used

Output as a JSON object where each key is a table name and each value is the complete documentation for that table:

{{
  "table_name_1": "## Purpose\\n...\\n\\n## Columns\\n...\\n\\n## Relationships\\n...\\n\\n## Business Rules\\n...\\n\\n## Common Use Cases\\n...",
  "table_name_2": "## Purpose\\n...\\n\\n## Columns\\n...\\n\\n## Relationships\\n...\\n\\n## Business Rules\\n...\\n\\n## Common Use Cases\\n..."
}}

Write in a clear, professional style suitable for developers and analysts. Be concise but thorough.
Only output valid JSON, nothing else."""

        response = self._invoke(prompt, max_tokens=8192)  # More tokens for multi-table docs

        try:
            # Handle potential markdown code blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse documentation as JSON: {response}")
            # Fallback: return as single "schema" entry
            return {"schema": response}

    def generate_sample_queries(
        self,
        ddl: str,
        num_queries: int = 5,
        context: Optional[str] = None,
    ) -> list[dict]:
        """
        Generate sample SQL queries for the schema.

        Args:
            ddl: The DDL/schema definition
            num_queries: Number of queries to generate
            context: Optional business context

        Returns:
            List of {question, sql} dictionaries
        """
        prompt = f"""You are a SQL expert. Generate {num_queries} useful sample SQL queries for the following database schema.

<schema>
{ddl}
</schema>

{f"Business context: {context}" if context else ""}

Generate practical queries that would be commonly needed, including:
- Basic lookups and filters
- Aggregations and summaries
- Joins between related tables
- Time-based analysis if date columns exist
- Common business questions

Output as a JSON array with this exact format:
[
  {{"question": "Natural language question", "sql": "SELECT ..."}},
  ...
]

Make queries realistic and useful. Use proper SQL formatting. Only output valid JSON, nothing else."""

        response = self._invoke(prompt)

        # Parse JSON response
        try:
            # Handle potential markdown code blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            queries = json.loads(response.strip())
            return queries
        except json.JSONDecodeError:
            logger.error(f"Failed to parse AI response as JSON: {response}")
            return []

    def analyze_schema(self, ddl: str) -> dict:
        """
        Analyze schema and provide insights.

        Args:
            ddl: The DDL/schema definition

        Returns:
            Analysis dict with tables, columns, relationships, suggestions
        """
        prompt = f"""You are a database architect. Analyze the following database schema and provide insights.

<schema>
{ddl}
</schema>

Analyze and output as JSON with this exact format:
{{
  "tables": ["list of table names"],
  "total_columns": <number>,
  "relationships": [
    {{"from_table": "...", "to_table": "...", "type": "one-to-many|many-to-many|one-to-one"}}
  ],
  "indexes_suggested": [
    {{"table": "...", "columns": ["..."], "reason": "..."}}
  ],
  "documentation_suggestions": [
    "Suggestion for what to document..."
  ],
  "query_patterns": [
    "Common query pattern description..."
  ]
}}

Only output valid JSON, nothing else."""

        response = self._invoke(prompt)

        try:
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse schema analysis: {response}")
            return {"error": "Failed to analyze schema"}

    def suggest_documentation(self, ddl: str, existing_docs: list[str]) -> list[str]:
        """
        Suggest what documentation is missing.

        Args:
            ddl: The DDL/schema definition
            existing_docs: List of existing documentation entries

        Returns:
            List of suggested documentation topics
        """
        existing_text = "\n---\n".join(existing_docs) if existing_docs else "None"

        prompt = f"""You are a database documentation expert. Given the schema and existing documentation, suggest what additional documentation would be valuable.

<schema>
{ddl}
</schema>

<existing_documentation>
{existing_text}
</existing_documentation>

Identify gaps in the documentation. What important aspects of the schema are not yet documented?

Output as a JSON array of strings, each being a specific documentation topic to add:
["Topic 1 to document", "Topic 2 to document", ...]

Focus on:
- Undocumented tables or columns
- Missing business rules
- Unclear relationships
- Important constraints not explained

Only output valid JSON, nothing else."""

        response = self._invoke(prompt)

        try:
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse suggestions: {response}")
            return []

    def improve_sql(self, sql: str, ddl: Optional[str] = None) -> dict:
        """
        Analyze and suggest improvements for a SQL query.

        Args:
            sql: The SQL query to analyze
            ddl: Optional schema for context

        Returns:
            Dict with improved_sql, explanation, and suggestions
        """
        prompt = f"""You are a SQL optimization expert. Analyze this query and suggest improvements.

<query>
{sql}
</query>

{f"<schema>\n{ddl}\n</schema>" if ddl else ""}

Analyze for:
- Performance optimizations
- Best practices
- Potential issues
- Clearer formatting

Output as JSON:
{{
  "improved_sql": "The optimized query...",
  "explanation": "What was improved and why...",
  "suggestions": ["Additional suggestion 1", "..."]
}}

Only output valid JSON, nothing else."""

        response = self._invoke(prompt)

        try:
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse SQL improvement: {response}")
            return {"error": "Failed to analyze SQL"}
