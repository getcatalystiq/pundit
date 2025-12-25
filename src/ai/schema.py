"""
Schema introspection for various database types.

Extracts DDL and schema information from connected databases.
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class TableInfo:
    """Information about a database table."""

    name: str
    schema: str
    columns: list[dict]
    primary_key: list[str]
    foreign_keys: list[dict]
    indexes: list[dict]
    row_count: Optional[int] = None


@dataclass
class SchemaInfo:
    """Complete schema information."""

    tables: list[TableInfo]
    views: list[dict]
    ddl: str
    database_type: str


class SchemaIntrospector:
    """Introspect database schemas and extract DDL."""

    def __init__(self, connection: Any, db_type: str):
        """
        Initialize introspector.

        Args:
            connection: Database connection object
            db_type: Type of database (postgresql, mysql, snowflake, bigquery)
        """
        self.connection = connection
        self.db_type = db_type.lower()

    def get_tables(self, schema: str = "public") -> list[str]:
        """Get list of table names in schema."""
        if self.db_type == "postgresql":
            return self._pg_get_tables(schema)
        elif self.db_type == "mysql":
            return self._mysql_get_tables(schema)
        elif self.db_type == "snowflake":
            return self._snowflake_get_tables(schema)
        elif self.db_type == "bigquery":
            return self._bigquery_get_tables(schema)
        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

    def get_ddl(self, schema: str = "public", tables: Optional[list[str]] = None) -> str:
        """
        Get DDL for schema or specific tables.

        Args:
            schema: Schema name
            tables: Optional list of specific tables

        Returns:
            DDL statements as string
        """
        if self.db_type == "postgresql":
            return self._pg_get_ddl(schema, tables)
        elif self.db_type == "mysql":
            return self._mysql_get_ddl(schema, tables)
        elif self.db_type == "snowflake":
            return self._snowflake_get_ddl(schema, tables)
        elif self.db_type == "bigquery":
            return self._bigquery_get_ddl(schema, tables)
        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

    def get_ddl_by_table(self, schema: str = "public", tables: Optional[list[str]] = None) -> dict[str, str]:
        """
        Get DDL for each table separately.

        Args:
            schema: Schema name
            tables: Optional list of specific tables

        Returns:
            Dict mapping table names to their DDL statements
        """
        if self.db_type == "postgresql":
            return self._pg_get_ddl_by_table(schema, tables)
        elif self.db_type == "mysql":
            return self._mysql_get_ddl_by_table(schema, tables)
        elif self.db_type == "snowflake":
            return self._snowflake_get_ddl_by_table(schema, tables)
        elif self.db_type == "bigquery":
            return self._bigquery_get_ddl_by_table(schema, tables)
        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

    def get_table_info(self, table: str, schema: str = "public") -> TableInfo:
        """Get detailed information about a table."""
        if self.db_type == "postgresql":
            return self._pg_get_table_info(table, schema)
        elif self.db_type == "mysql":
            return self._mysql_get_table_info(table, schema)
        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

    def get_sample_data(
        self, table: str, schema: str = "public", limit: int = 5
    ) -> list[dict]:
        """Get sample rows from a table."""
        cursor = self.connection.cursor()
        try:
            if self.db_type in ("postgresql", "mysql"):
                cursor.execute(f'SELECT * FROM "{schema}"."{table}" LIMIT {limit}')
            elif self.db_type == "snowflake":
                cursor.execute(f'SELECT * FROM "{schema}"."{table}" LIMIT {limit}')
            else:
                cursor.execute(f"SELECT * FROM `{schema}`.`{table}` LIMIT {limit}")

            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            cursor.close()

    # PostgreSQL implementations
    def _pg_get_tables(self, schema: str) -> list[str]:
        cursor = self.connection.cursor()
        try:
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                (schema,),
            )
            return [row[0] for row in cursor.fetchall()]
        finally:
            cursor.close()

    def _pg_get_ddl(self, schema: str, tables: Optional[list[str]] = None) -> str:
        """Generate DDL for PostgreSQL tables."""
        cursor = self.connection.cursor()
        ddl_parts = []

        try:
            # Get tables to process
            if tables:
                table_list = tables
            else:
                table_list = self._pg_get_tables(schema)

            for table in table_list:
                # Get columns
                cursor.execute(
                    """
                    SELECT
                        column_name,
                        data_type,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, table),
                )
                columns = cursor.fetchall()

                # Get primary key
                cursor.execute(
                    """
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = %s
                        AND tc.table_name = %s
                    ORDER BY kcu.ordinal_position
                    """,
                    (schema, table),
                )
                pk_columns = [row[0] for row in cursor.fetchall()]

                # Get foreign keys
                cursor.execute(
                    """
                    SELECT
                        kcu.column_name,
                        ccu.table_name AS foreign_table,
                        ccu.column_name AS foreign_column,
                        tc.constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                        AND tc.table_schema = %s
                        AND tc.table_name = %s
                    """,
                    (schema, table),
                )
                foreign_keys = cursor.fetchall()

                # Build CREATE TABLE statement
                ddl = f'CREATE TABLE "{schema}"."{table}" (\n'

                col_defs = []
                for col in columns:
                    col_name, data_type, char_len, num_prec, num_scale, nullable, default = col

                    # Build data type
                    if char_len:
                        type_str = f"{data_type}({char_len})"
                    elif num_prec and data_type == "numeric":
                        type_str = f"numeric({num_prec},{num_scale or 0})"
                    else:
                        type_str = data_type

                    col_def = f'    "{col_name}" {type_str}'

                    if nullable == "NO":
                        col_def += " NOT NULL"
                    if default:
                        col_def += f" DEFAULT {default}"

                    col_defs.append(col_def)

                # Add primary key constraint
                if pk_columns:
                    pk_cols = ", ".join(f'"{c}"' for c in pk_columns)
                    col_defs.append(f"    PRIMARY KEY ({pk_cols})")

                # Add foreign key constraints
                for fk in foreign_keys:
                    col, ref_table, ref_col, constraint_name = fk
                    col_defs.append(
                        f'    CONSTRAINT "{constraint_name}" FOREIGN KEY ("{col}") '
                        f'REFERENCES "{schema}"."{ref_table}" ("{ref_col}")'
                    )

                ddl += ",\n".join(col_defs)
                ddl += "\n);\n"

                ddl_parts.append(ddl)

            return "\n".join(ddl_parts)

        finally:
            cursor.close()

    def _pg_get_ddl_by_table(self, schema: str, tables: Optional[list[str]] = None) -> dict[str, str]:
        """Generate DDL for PostgreSQL tables, returning dict of table -> DDL."""
        cursor = self.connection.cursor()
        ddl_by_table = {}

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._pg_get_tables(schema)

            for table in table_list:
                # Get columns
                cursor.execute(
                    """
                    SELECT
                        column_name,
                        data_type,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, table),
                )
                columns = cursor.fetchall()

                # Get primary key
                cursor.execute(
                    """
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = %s
                        AND tc.table_name = %s
                    ORDER BY kcu.ordinal_position
                    """,
                    (schema, table),
                )
                pk_columns = [row[0] for row in cursor.fetchall()]

                # Get foreign keys
                cursor.execute(
                    """
                    SELECT
                        kcu.column_name,
                        ccu.table_name AS foreign_table,
                        ccu.column_name AS foreign_column,
                        tc.constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                        AND tc.table_schema = %s
                        AND tc.table_name = %s
                    """,
                    (schema, table),
                )
                foreign_keys = cursor.fetchall()

                # Build CREATE TABLE statement
                ddl = f'CREATE TABLE "{schema}"."{table}" (\n'

                col_defs = []
                for col in columns:
                    col_name, data_type, char_len, num_prec, num_scale, nullable, default = col

                    if char_len:
                        type_str = f"{data_type}({char_len})"
                    elif num_prec and data_type == "numeric":
                        type_str = f"numeric({num_prec},{num_scale or 0})"
                    else:
                        type_str = data_type

                    col_def = f'    "{col_name}" {type_str}'

                    if nullable == "NO":
                        col_def += " NOT NULL"
                    if default:
                        col_def += f" DEFAULT {default}"

                    col_defs.append(col_def)

                if pk_columns:
                    pk_cols = ", ".join(f'"{c}"' for c in pk_columns)
                    col_defs.append(f"    PRIMARY KEY ({pk_cols})")

                for fk in foreign_keys:
                    col, ref_table, ref_col, constraint_name = fk
                    col_defs.append(
                        f'    CONSTRAINT "{constraint_name}" FOREIGN KEY ("{col}") '
                        f'REFERENCES "{schema}"."{ref_table}" ("{ref_col}")'
                    )

                ddl += ",\n".join(col_defs)
                ddl += "\n);"

                ddl_by_table[table] = ddl

            return ddl_by_table

        finally:
            cursor.close()

    def _pg_get_table_info(self, table: str, schema: str) -> TableInfo:
        """Get detailed PostgreSQL table info."""
        cursor = self.connection.cursor()
        try:
            # Get columns
            cursor.execute(
                """
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema, table),
            )
            columns = [
                {
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3],
                    "max_length": row[4],
                }
                for row in cursor.fetchall()
            ]

            # Get primary key
            cursor.execute(
                """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = %s AND tc.table_name = %s
                """,
                (schema, table),
            )
            pk = [row[0] for row in cursor.fetchall()]

            # Get foreign keys
            cursor.execute(
                """
                SELECT
                    kcu.column_name,
                    ccu.table_name,
                    ccu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = %s AND tc.table_name = %s
                """,
                (schema, table),
            )
            fks = [
                {"column": row[0], "references_table": row[1], "references_column": row[2]}
                for row in cursor.fetchall()
            ]

            # Get indexes
            cursor.execute(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = %s AND tablename = %s
                """,
                (schema, table),
            )
            indexes = [{"name": row[0], "definition": row[1]} for row in cursor.fetchall()]

            # Get row count estimate
            cursor.execute(
                f'SELECT reltuples::bigint FROM pg_class WHERE relname = %s',
                (table,),
            )
            row = cursor.fetchone()
            row_count = row[0] if row else None

            return TableInfo(
                name=table,
                schema=schema,
                columns=columns,
                primary_key=pk,
                foreign_keys=fks,
                indexes=indexes,
                row_count=row_count,
            )

        finally:
            cursor.close()

    # MySQL implementations
    def _mysql_get_tables(self, schema: str) -> list[str]:
        cursor = self.connection.cursor()
        try:
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                (schema,),
            )
            return [row[0] for row in cursor.fetchall()]
        finally:
            cursor.close()

    def _mysql_get_ddl(self, schema: str, tables: Optional[list[str]] = None) -> str:
        """Generate DDL for MySQL tables using SHOW CREATE TABLE."""
        cursor = self.connection.cursor()
        ddl_parts = []

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._mysql_get_tables(schema)

            for table in table_list:
                cursor.execute(f"SHOW CREATE TABLE `{schema}`.`{table}`")
                row = cursor.fetchone()
                if row:
                    ddl_parts.append(row[1] + ";")

            return "\n\n".join(ddl_parts)

        finally:
            cursor.close()

    def _mysql_get_ddl_by_table(self, schema: str, tables: Optional[list[str]] = None) -> dict[str, str]:
        """Generate DDL for MySQL tables, returning dict of table -> DDL."""
        cursor = self.connection.cursor()
        ddl_by_table = {}

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._mysql_get_tables(schema)

            for table in table_list:
                cursor.execute(f"SHOW CREATE TABLE `{schema}`.`{table}`")
                row = cursor.fetchone()
                if row:
                    ddl_by_table[table] = row[1] + ";"

            return ddl_by_table

        finally:
            cursor.close()

    def _mysql_get_table_info(self, table: str, schema: str) -> TableInfo:
        """Get detailed MySQL table info."""
        cursor = self.connection.cursor()
        try:
            # Get columns
            cursor.execute(
                """
                SELECT
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT,
                    CHARACTER_MAXIMUM_LENGTH
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
                """,
                (schema, table),
            )
            columns = [
                {
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3],
                    "max_length": row[4],
                }
                for row in cursor.fetchall()
            ]

            # Get primary key
            cursor.execute(
                """
                SELECT COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                    AND CONSTRAINT_NAME = 'PRIMARY'
                ORDER BY ORDINAL_POSITION
                """,
                (schema, table),
            )
            pk = [row[0] for row in cursor.fetchall()]

            # Get foreign keys
            cursor.execute(
                """
                SELECT
                    COLUMN_NAME,
                    REFERENCED_TABLE_NAME,
                    REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                """,
                (schema, table),
            )
            fks = [
                {"column": row[0], "references_table": row[1], "references_column": row[2]}
                for row in cursor.fetchall()
            ]

            return TableInfo(
                name=table,
                schema=schema,
                columns=columns,
                primary_key=pk,
                foreign_keys=fks,
                indexes=[],
            )

        finally:
            cursor.close()

    # Snowflake implementations
    def _snowflake_get_tables(self, schema: str) -> list[str]:
        cursor = self.connection.cursor()
        try:
            cursor.execute(f"SHOW TABLES IN SCHEMA {schema}")
            return [row[1] for row in cursor.fetchall()]
        finally:
            cursor.close()

    def _snowflake_get_ddl(self, schema: str, tables: Optional[list[str]] = None) -> str:
        """Generate DDL for Snowflake tables."""
        cursor = self.connection.cursor()
        ddl_parts = []

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._snowflake_get_tables(schema)

            for table in table_list:
                cursor.execute(f"SELECT GET_DDL('TABLE', '{schema}.{table}')")
                row = cursor.fetchone()
                if row:
                    ddl_parts.append(row[0])

            return "\n\n".join(ddl_parts)

        finally:
            cursor.close()

    def _snowflake_get_ddl_by_table(self, schema: str, tables: Optional[list[str]] = None) -> dict[str, str]:
        """Generate DDL for Snowflake tables, returning dict of table -> DDL."""
        cursor = self.connection.cursor()
        ddl_by_table = {}

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._snowflake_get_tables(schema)

            for table in table_list:
                cursor.execute(f"SELECT GET_DDL('TABLE', '{schema}.{table}')")
                row = cursor.fetchone()
                if row:
                    ddl_by_table[table] = row[0]

            return ddl_by_table

        finally:
            cursor.close()

    # BigQuery implementations
    def _bigquery_get_tables(self, dataset: str) -> list[str]:
        """Get tables in BigQuery dataset."""
        cursor = self.connection.cursor()
        try:
            cursor.execute(
                f"""
                SELECT table_name
                FROM `{dataset}.INFORMATION_SCHEMA.TABLES`
                WHERE table_type = 'BASE TABLE'
                ORDER BY table_name
                """
            )
            return [row[0] for row in cursor.fetchall()]
        finally:
            cursor.close()

    def _bigquery_get_ddl(self, dataset: str, tables: Optional[list[str]] = None) -> str:
        """Generate DDL for BigQuery tables."""
        cursor = self.connection.cursor()
        ddl_parts = []

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._bigquery_get_tables(dataset)

            for table in table_list:
                cursor.execute(
                    f"""
                    SELECT ddl
                    FROM `{dataset}.INFORMATION_SCHEMA.TABLES`
                    WHERE table_name = '{table}'
                    """
                )
                row = cursor.fetchone()
                if row and row[0]:
                    ddl_parts.append(row[0])

            return "\n\n".join(ddl_parts)

        finally:
            cursor.close()

    def _bigquery_get_ddl_by_table(self, dataset: str, tables: Optional[list[str]] = None) -> dict[str, str]:
        """Generate DDL for BigQuery tables, returning dict of table -> DDL."""
        cursor = self.connection.cursor()
        ddl_by_table = {}

        try:
            if tables:
                table_list = tables
            else:
                table_list = self._bigquery_get_tables(dataset)

            for table in table_list:
                cursor.execute(
                    f"""
                    SELECT ddl
                    FROM `{dataset}.INFORMATION_SCHEMA.TABLES`
                    WHERE table_name = '{table}'
                    """
                )
                row = cursor.fetchone()
                if row and row[0]:
                    ddl_by_table[table] = row[0]

            return ddl_by_table

        finally:
            cursor.close()
