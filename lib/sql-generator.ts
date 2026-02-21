import { generateObject, gateway } from "ai";
import { z } from "zod";
import { type TrainingDataContext, toPromptSections } from "@/lib/rag";

const SqlGenerationSchema = z.object({
  sql: z.string().describe("The SQL SELECT query"),
  explanation: z
    .string()
    .describe("Brief explanation of what the query does"),
});

export type SqlGenerationResult = z.infer<typeof SqlGenerationSchema>;

/**
 * Generate a SQL query from a natural language question using RAG context.
 */
export async function generateSql(
  question: string,
  context: TrainingDataContext
): Promise<SqlGenerationResult> {
  const contextSections = toPromptSections(context);

  const { object } = await generateObject({
    model: gateway("anthropic/claude-sonnet-4"),
    schema: SqlGenerationSchema,
    temperature: 0,
    maxOutputTokens: 4096,
    system: `You are a SQL expert. Generate a PostgreSQL SELECT query to answer the user's question.

RULES:
- Only generate SELECT queries (no INSERT, UPDATE, DELETE, DROP, etc.)
- Use the provided database schema and context to write accurate queries
- Include appropriate JOINs, WHERE clauses, and aggregations
- Add ORDER BY when it makes sense for the data
- Do not include LIMIT unless the user specifically asks for a limited number of results
- Use standard PostgreSQL syntax
- If you cannot answer the question with the available schema, explain why in the explanation field and provide the closest approximation

DATABASE CONTEXT:
${contextSections}`,
    prompt: question,
  });

  return object;
}
