import { generateObject, gateway } from "ai";
import { z } from "zod";

const model = gateway("anthropic/claude-sonnet-4-6");

// --- Schemas ---

const DocumentationSchema = z.record(
  z.string(),
  z.string().describe("Markdown documentation for a table")
);

const SampleQueriesSchema = z.object({
  queries: z.array(
    z.object({
      question: z.string().describe("Natural language question"),
      sql: z.string().describe("SQL query that answers the question"),
    })
  ),
});

const SchemaAnalysisSchema = z.object({
  tables: z.array(z.string()),
  total_columns: z.number(),
  relationships: z.array(
    z.object({
      from_table: z.string(),
      to_table: z.string(),
      type: z.enum(["one-to-many", "many-to-many", "one-to-one"]),
    })
  ),
  indexes_suggested: z.array(
    z.object({
      table: z.string(),
      columns: z.array(z.string()),
      reason: z.string(),
    })
  ),
  documentation_suggestions: z.array(z.string()),
  query_patterns: z.array(z.string()),
});

export type SchemaAnalysis = z.infer<typeof SchemaAnalysisSchema>;

// --- Functions ---

/**
 * Generate per-table documentation from DDL.
 * Returns { tableName: markdownDocumentation }
 */
export async function generateDocumentation(
  ddl: string
): Promise<Record<string, string>> {
  const { object } = await generateObject({
    model,
    schema: DocumentationSchema,
    temperature: 0,
    maxOutputTokens: 8192,
    system: `You are a database documentation expert. Given DDL (CREATE TABLE statements), generate comprehensive documentation for each table.

For each table, include these sections in markdown:
## Purpose
Brief description of what the table stores and its role.

## Columns
Description of each column, its type, and purpose.

## Relationships
Foreign keys and how this table relates to others.

## Business Rules
Any constraints, defaults, or rules inferred from the schema.

## Common Use Cases
Typical queries or operations involving this table.`,
    prompt: ddl,
  });

  return object;
}

/**
 * Generate sample question/SQL pairs from DDL.
 */
export async function generateSampleQueries(
  ddl: string,
  numQueries: number = 5
): Promise<Array<{ question: string; sql: string }>> {
  const { object } = await generateObject({
    model,
    schema: SampleQueriesSchema,
    temperature: 0,
    maxOutputTokens: 4096,
    system: `You are a SQL expert. Given DDL, generate ${numQueries} sample natural language questions and their corresponding SQL queries.

Rules:
- Only generate SELECT queries
- Cover a variety of query types: simple lookups, aggregations, joins, filters
- Questions should be realistic business questions a user might ask
- SQL must be valid PostgreSQL`,
    prompt: ddl,
  });

  return object.queries;
}

/**
 * Analyze a database schema and return insights.
 */
export async function analyzeSchema(
  ddl: string
): Promise<SchemaAnalysis> {
  const { object } = await generateObject({
    model,
    schema: SchemaAnalysisSchema,
    temperature: 0,
    maxOutputTokens: 4096,
    system: `You are a database architect. Analyze the provided DDL and return:
- List of tables
- Total column count
- Relationships between tables (inferred from foreign keys and naming conventions)
- Suggested indexes for common query patterns
- Documentation suggestions (what's missing or unclear)
- Common query patterns that this schema supports`,
    prompt: ddl,
  });

  return object;
}
