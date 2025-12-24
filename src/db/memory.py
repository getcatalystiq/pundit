"""RAG memory for database context retrieval."""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from .aurora import get_aurora_client, param
from .embeddings import generate_embedding

logger = logging.getLogger(__name__)


def extract_table_name_from_ddl(ddl: str) -> Optional[str]:
    """Extract table name from a CREATE TABLE statement."""
    # Match CREATE TABLE [IF NOT EXISTS] [schema.]table_name
    pattern = r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"]+\.)?["\']?([\w]+)["\']?'
    match = re.search(pattern, ddl, re.IGNORECASE)
    return match.group(1).lower() if match else None


def find_mentioned_tables(question: str, known_tables: list[str]) -> set[str]:
    """Find table names mentioned in the question."""
    question_lower = question.lower()
    # Also check for common variations (singular/plural, underscores as spaces)
    mentioned = set()
    for table in known_tables:
        table_lower = table.lower()
        # Check exact match
        if table_lower in question_lower:
            mentioned.add(table_lower)
        # Check with spaces instead of underscores
        table_spaced = table_lower.replace("_", " ")
        if table_spaced in question_lower:
            mentioned.add(table_lower)
        # Check singular form (remove trailing 's')
        if table_lower.endswith("s"):
            singular = table_lower[:-1]
            if singular in question_lower:
                mentioned.add(table_lower)
    return mentioned


@dataclass
class TrainingDataContext:
    """Context retrieved from training data tables."""

    ddl: list[dict] = field(default_factory=list)
    documentation: list[dict] = field(default_factory=list)
    examples: list[dict] = field(default_factory=list)
    tool_memory: list[dict] = field(default_factory=list)
    text_memory: list[dict] = field(default_factory=list)

    def to_prompt_sections(self) -> str:
        """Format context as prompt sections with relevance scores."""
        sections = []

        if self.ddl:
            ddl_parts = []
            for d in self.ddl:
                similarity = d.get("similarity", 0)
                ddl_parts.append(f"-- Relevance: {similarity:.0%}\n{d['ddl']}")
            ddl_text = "\n\n".join(ddl_parts)
            sections.append(f"## Database Schema\n\n```sql\n{ddl_text}\n```")

        if self.documentation:
            doc_parts = []
            for d in self.documentation:
                similarity = d.get("similarity", 0)
                doc_parts.append(f"_(Relevance: {similarity:.0%})_\n{d['documentation']}")
            doc_text = "\n\n".join(doc_parts)
            sections.append(f"## Documentation\n\n{doc_text}")

        if self.examples:
            examples_parts = []
            for e in self.examples:
                similarity = e.get("similarity", 0)
                examples_parts.append(
                    f"**Question:** {e['question']} _(Relevance: {similarity:.0%})_\n```sql\n{e['sql']}\n```"
                )
            examples_text = "\n\n".join(examples_parts)
            sections.append(f"## Example Queries\n\n{examples_text}")

        if self.tool_memory:
            memory_parts = []
            for m in self.tool_memory:
                similarity = m.get("similarity", 0)
                sql = m['tool_args'].get('sql', '') if isinstance(m.get('tool_args'), dict) else ''
                memory_parts.append(
                    f"**Question:** {m['question']} _(Relevance: {similarity:.0%})_\n```sql\n{sql}\n```"
                )
            memory_text = "\n\n".join(memory_parts)
            sections.append(f"## Past Successful Queries\n\n{memory_text}")

        if self.text_memory:
            text_parts = []
            for m in self.text_memory:
                similarity = m.get("similarity", 0)
                text_parts.append(f"_(Relevance: {similarity:.0%})_\n{m['content']}")
            text_text = "\n\n".join(text_parts)
            sections.append(f"## Business Context\n\n{text_text}")

        return "\n\n---\n\n".join(sections)

    @property
    def is_empty(self) -> bool:
        """Check if context is empty."""
        return not any([
            self.ddl,
            self.documentation,
            self.examples,
            self.tool_memory,
            self.text_memory,
        ])


class DatabaseMemory:
    """
    RAG memory for a specific tenant and database.

    Retrieves relevant context from db_* tables using pgvector similarity search.
    """

    def __init__(self, tenant_id: str, database_id: str):
        self.tenant_id = tenant_id
        self.database_id = database_id

    def get_training_data_counts(self) -> dict[str, int]:
        """Get counts of training data in each table."""
        aurora = get_aurora_client()
        result = aurora.query(
            """
            SELECT
                (SELECT COUNT(*) FROM db_ddl WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid) AS ddl_count,
                (SELECT COUNT(*) FROM db_documentation WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid) AS doc_count,
                (SELECT COUNT(*) FROM db_question_sql WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid) AS examples_count,
                (SELECT COUNT(*) FROM db_tool_memory WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid AND success = TRUE) AS tool_memory_count,
                (SELECT COUNT(*) FROM db_text_memory WHERE tenant_id = :tenant_id::uuid AND database_id = :database_id::uuid) AS text_memory_count
            """,
            [
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
            ],
        )
        if result:
            return {
                "ddl": result[0].get("ddl_count", 0) or 0,
                "doc": result[0].get("doc_count", 0) or 0,
                "examples": result[0].get("examples_count", 0) or 0,
                "tool_memory": result[0].get("tool_memory_count", 0) or 0,
                "text_memory": result[0].get("text_memory_count", 0) or 0,
            }
        return {"ddl": 0, "doc": 0, "examples": 0, "tool_memory": 0, "text_memory": 0}

    def calculate_dynamic_limits(
        self,
        total_budget: int = 20,
        min_per_type: int = 2,
    ) -> dict[str, int]:
        """
        Calculate dynamic limits based on available training data.

        Distributes budget proportionally to what's available,
        reallocating from types with fewer items to others.
        """
        counts = self.get_training_data_counts()

        # Default allocation
        base_limits = {
            "ddl": 5,
            "doc": 5,
            "examples": 5,
            "tool_memory": 3,
            "text_memory": 2,
        }

        # Calculate actual limits based on availability
        limits = {}
        remaining_budget = total_budget

        # First pass: allocate up to base or available count
        for key, base in base_limits.items():
            available = counts.get(key, 0)
            allocated = min(base, available)
            limits[key] = allocated
            remaining_budget -= allocated

        # Second pass: redistribute remaining budget to types with more data
        if remaining_budget > 0:
            for key in ["ddl", "doc", "examples", "tool_memory", "text_memory"]:
                available = counts.get(key, 0)
                current = limits[key]
                extra = min(remaining_budget, available - current)
                if extra > 0:
                    limits[key] += extra
                    remaining_budget -= extra
                if remaining_budget <= 0:
                    break

        return limits

    def search_training_data(
        self,
        query: str,
        ddl_limit: int = 5,
        doc_limit: int = 5,
        examples_limit: int = 5,
        tool_memory_limit: int = 3,
        text_memory_limit: int = 3,
        similarity_threshold: float = 0.3,
        use_dynamic_limits: bool = True,
    ) -> TrainingDataContext:
        """
        Search all training data tables for relevant context.

        Args:
            query: Natural language query
            ddl_limit: Max DDL results (ignored if use_dynamic_limits=True)
            doc_limit: Max documentation results (ignored if use_dynamic_limits=True)
            examples_limit: Max example query results (ignored if use_dynamic_limits=True)
            tool_memory_limit: Max tool memory results (ignored if use_dynamic_limits=True)
            text_memory_limit: Max text memory results (ignored if use_dynamic_limits=True)
            similarity_threshold: Min similarity for all tables
            use_dynamic_limits: If True, calculate limits based on available data

        Returns:
            TrainingDataContext with relevant data from all tables
        """
        # Use dynamic limits if enabled
        if use_dynamic_limits:
            limits = self.calculate_dynamic_limits()
            ddl_limit = limits["ddl"]
            doc_limit = limits["doc"]
            examples_limit = limits["examples"]
            tool_memory_limit = limits["tool_memory"]
            text_memory_limit = limits["text_memory"]
            logger.debug(f"Using dynamic limits: {limits}")

        # Generate embedding for query
        embedding = generate_embedding(query)
        embedding_str = json.dumps(embedding)

        aurora = get_aurora_client()

        # First, get all known table names for this database
        all_ddl = aurora.query(
            """
            SELECT ddl FROM db_ddl
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
            """,
            [
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
            ],
        )
        known_tables = [
            extract_table_name_from_ddl(row["ddl"])
            for row in all_ddl
            if extract_table_name_from_ddl(row["ddl"])
        ]

        # Find tables mentioned in the question
        mentioned_tables = find_mentioned_tables(query, known_tables)
        mentioned_pattern = "|".join(mentioned_tables) if mentioned_tables else None

        # Search DDL with similarity threshold and table name boosting
        # If table is mentioned in question, boost its score by 0.3
        if mentioned_pattern:
            ddl_results = aurora.query(
                """
                SELECT id, ddl,
                       1 - (embedding <=> :embedding::vector) AS similarity,
                       CASE
                           WHEN LOWER(ddl) ~* :mentioned_pattern THEN 0.3
                           ELSE 0
                       END AS mention_boost,
                       (1 - (embedding <=> :embedding::vector)) +
                       CASE
                           WHEN LOWER(ddl) ~* :mentioned_pattern THEN 0.3
                           ELSE 0
                       END AS boosted_score
                FROM db_ddl
                WHERE tenant_id = :tenant_id::uuid
                  AND database_id = :database_id::uuid
                  AND embedding IS NOT NULL
                  AND (1 - (embedding <=> :embedding::vector)) >= :threshold
                ORDER BY boosted_score DESC
                LIMIT :limit
                """,
                [
                    param("embedding", embedding_str),
                    param("tenant_id", self.tenant_id, "UUID"),
                    param("database_id", self.database_id, "UUID"),
                    param("threshold", similarity_threshold),
                    param("mentioned_pattern", f"({mentioned_pattern})"),
                    param("limit", ddl_limit),
                ],
            )
        else:
            ddl_results = aurora.query(
                """
                SELECT id, ddl, 1 - (embedding <=> :embedding::vector) AS similarity
                FROM db_ddl
                WHERE tenant_id = :tenant_id::uuid
                  AND database_id = :database_id::uuid
                  AND embedding IS NOT NULL
                  AND (1 - (embedding <=> :embedding::vector)) >= :threshold
                ORDER BY embedding <=> :embedding::vector
                LIMIT :limit
                """,
                [
                    param("embedding", embedding_str),
                    param("tenant_id", self.tenant_id, "UUID"),
                    param("database_id", self.database_id, "UUID"),
                    param("threshold", similarity_threshold),
                    param("limit", ddl_limit),
                ],
            )

        # Extract table names from retrieved DDL for hierarchical doc retrieval
        retrieved_tables = set()
        for ddl_row in ddl_results:
            table_name = extract_table_name_from_ddl(ddl_row.get("ddl", ""))
            if table_name:
                retrieved_tables.add(table_name)

        # Combine mentioned tables and retrieved tables for documentation boosting
        all_relevant_tables = mentioned_tables | retrieved_tables
        doc_table_pattern = "|".join(all_relevant_tables) if all_relevant_tables else None

        # Search documentation with similarity threshold and table boosting
        # Boost docs that reference tables from DDL results or mentioned in question
        if doc_table_pattern:
            doc_results = aurora.query(
                """
                SELECT id, documentation,
                       1 - (embedding <=> :embedding::vector) AS similarity,
                       CASE
                           WHEN LOWER(documentation) ~* :table_pattern THEN 0.25
                           ELSE 0
                       END AS table_boost,
                       (1 - (embedding <=> :embedding::vector)) +
                       CASE
                           WHEN LOWER(documentation) ~* :table_pattern THEN 0.25
                           ELSE 0
                       END AS boosted_score
                FROM db_documentation
                WHERE tenant_id = :tenant_id::uuid
                  AND database_id = :database_id::uuid
                  AND embedding IS NOT NULL
                  AND (1 - (embedding <=> :embedding::vector)) >= :threshold
                ORDER BY boosted_score DESC
                LIMIT :limit
                """,
                [
                    param("embedding", embedding_str),
                    param("tenant_id", self.tenant_id, "UUID"),
                    param("database_id", self.database_id, "UUID"),
                    param("threshold", similarity_threshold),
                    param("table_pattern", f"({doc_table_pattern})"),
                    param("limit", doc_limit),
                ],
            )
        else:
            doc_results = aurora.query(
                """
                SELECT id, documentation, 1 - (embedding <=> :embedding::vector) AS similarity
                FROM db_documentation
                WHERE tenant_id = :tenant_id::uuid
                  AND database_id = :database_id::uuid
                  AND embedding IS NOT NULL
                  AND (1 - (embedding <=> :embedding::vector)) >= :threshold
                ORDER BY embedding <=> :embedding::vector
                LIMIT :limit
                """,
                [
                    param("embedding", embedding_str),
                    param("tenant_id", self.tenant_id, "UUID"),
                    param("database_id", self.database_id, "UUID"),
                    param("threshold", similarity_threshold),
                    param("limit", doc_limit),
                ],
            )

        # Search question-SQL examples with similarity threshold
        examples_results = aurora.query(
            """
            SELECT id, question, sql, 1 - (embedding <=> :embedding::vector) AS similarity
            FROM db_question_sql
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= :threshold
            ORDER BY embedding <=> :embedding::vector
            LIMIT :limit
            """,
            [
                param("embedding", embedding_str),
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
                param("threshold", similarity_threshold),
                param("limit", examples_limit),
            ],
        )

        # Search tool memory with threshold and recency weighting
        # 80% similarity + 20% recency (queries from today score higher)
        tool_memory_results = aurora.query(
            """
            SELECT id, question, tool_name, tool_args, created_at,
                   1 - (embedding <=> :embedding::vector) AS similarity,
                   (1 - (embedding <=> :embedding::vector)) * 0.8 +
                   (1.0 / (EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 + 1)) * 0.2
                   AS weighted_score
            FROM db_tool_memory
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
              AND embedding IS NOT NULL
              AND success = TRUE
              AND (1 - (embedding <=> :embedding::vector)) >= :threshold
            ORDER BY weighted_score DESC
            LIMIT :limit
            """,
            [
                param("embedding", embedding_str),
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
                param("threshold", similarity_threshold),
                param("limit", tool_memory_limit),
            ],
        )

        # Parse tool_args JSON
        for row in tool_memory_results:
            if isinstance(row.get("tool_args"), str):
                row["tool_args"] = json.loads(row["tool_args"])

        # Search text memory with threshold
        text_memory_results = aurora.query(
            """
            SELECT id, content, 1 - (embedding <=> :embedding::vector) AS similarity
            FROM db_text_memory
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= :threshold
            ORDER BY embedding <=> :embedding::vector
            LIMIT :limit
            """,
            [
                param("embedding", embedding_str),
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
                param("threshold", similarity_threshold),
                param("limit", text_memory_limit),
            ],
        )

        return TrainingDataContext(
            ddl=ddl_results,
            documentation=doc_results,
            examples=examples_results,
            tool_memory=tool_memory_results,
            text_memory=text_memory_results,
        )

    def save_tool_memory(
        self,
        question: str,
        tool_name: str,
        tool_args: dict,
        success: bool = True,
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Save a tool execution to memory for future RAG retrieval.

        Args:
            question: Original question
            tool_name: Name of the tool (e.g., "execute_sql")
            tool_args: Tool arguments (e.g., {"sql": "..."})
            success: Whether execution was successful
            metadata: Optional extra context

        Returns:
            ID of the saved memory
        """
        # Check for near-duplicate
        embedding = generate_embedding(question)
        embedding_str = json.dumps(embedding)

        aurora = get_aurora_client()

        # Check similarity to existing entries
        existing = aurora.query(
            """
            SELECT id, 1 - (embedding <=> :embedding::vector) AS similarity
            FROM db_tool_memory
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= 0.95
            LIMIT 1
            """,
            [
                param("embedding", embedding_str),
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
            ],
        )

        if existing:
            logger.debug(f"Skipping duplicate tool memory (similarity: {existing[0]['similarity']})")
            return existing[0]["id"]

        # Insert new memory
        result = aurora.query(
            """
            INSERT INTO db_tool_memory
                (tenant_id, database_id, question, tool_name, tool_args, success, metadata, embedding)
            VALUES
                (:tenant_id::uuid, :database_id::uuid, :question, :tool_name,
                 :tool_args::jsonb, :success, :metadata::jsonb, :embedding::vector)
            RETURNING id
            """,
            [
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
                param("question", question),
                param("tool_name", tool_name),
                param("tool_args", json.dumps(tool_args)),
                param("success", success),
                param("metadata", json.dumps(metadata) if metadata else None),
                param("embedding", embedding_str),
            ],
        )

        return result[0]["id"] if result else None

    def save_text_memory(self, content: str) -> str:
        """
        Save text/business context to memory.

        Args:
            content: Text content to save

        Returns:
            ID of the saved memory
        """
        embedding = generate_embedding(content)
        embedding_str = json.dumps(embedding)

        aurora = get_aurora_client()

        # Check for near-duplicate
        existing = aurora.query(
            """
            SELECT id, 1 - (embedding <=> :embedding::vector) AS similarity
            FROM db_text_memory
            WHERE tenant_id = :tenant_id::uuid
              AND database_id = :database_id::uuid
              AND embedding IS NOT NULL
              AND (1 - (embedding <=> :embedding::vector)) >= 0.95
            LIMIT 1
            """,
            [
                param("embedding", embedding_str),
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
            ],
        )

        if existing:
            logger.debug(f"Skipping duplicate text memory (similarity: {existing[0]['similarity']})")
            return existing[0]["id"]

        # Insert new memory
        result = aurora.query(
            """
            INSERT INTO db_text_memory
                (tenant_id, database_id, content, embedding)
            VALUES
                (:tenant_id::uuid, :database_id::uuid, :content, :embedding::vector)
            RETURNING id
            """,
            [
                param("tenant_id", self.tenant_id, "UUID"),
                param("database_id", self.database_id, "UUID"),
                param("content", content),
                param("embedding", embedding_str),
            ],
        )

        return result[0]["id"] if result else None


# Memory cache keyed by tenant_id:database_id
_memory_cache: dict[str, DatabaseMemory] = {}


def get_memory(tenant_id: str, database_id: str) -> DatabaseMemory:
    """Get or create DatabaseMemory instance."""
    cache_key = f"{tenant_id}:{database_id}"
    if cache_key not in _memory_cache:
        _memory_cache[cache_key] = DatabaseMemory(tenant_id, database_id)
    return _memory_cache[cache_key]
