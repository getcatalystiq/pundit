import { sql } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";

// --- Types ---

export type TrainingDataContext = {
  ddl: Array<{ content: string; similarity: number }>;
  documentation: Array<{ content: string; similarity: number }>;
  examples: Array<{ question: string; sql: string; similarity: number }>;
  toolMemory: Array<{
    question: string;
    toolName: string;
    similarity: number;
  }>;
  textMemory: Array<{ content: string; similarity: number }>;
};

const BASE_LIMITS = {
  ddl: 5,
  documentation: 5,
  examples: 5,
  toolMemory: 3,
  textMemory: 2,
};
const TOTAL_BUDGET = 20;
const MIN_SIMILARITY = 0.1;
const DDL_BOOST = 0.3;
const DOC_BOOST = 0.25;
const TOOL_MEMORY_SIMILARITY_WEIGHT = 0.8;
const TOOL_MEMORY_RECENCY_WEIGHT = 0.2;
const DUPLICATE_THRESHOLD = 0.95;

// --- Search ---

/**
 * Search all training data tables for relevant context.
 * Uses consolidated CTE query + two-phase boosting.
 */
export async function searchTrainingData(
  question: string,
  tenantId: string,
  databaseId: string
): Promise<TrainingDataContext> {
  const embedding = await generateEmbedding(question);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Single CTE query fetching candidates from all 5 tables
  const rows = await sql`
    WITH
    ddl_matches AS (
      SELECT id, ddl AS content, NULL::text AS question, NULL::text AS sql_text,
             NULL::text AS tool_name,
             1 - (embedding <=> ${embeddingStr}::vector) AS similarity,
             NULL::float AS recency_score,
             'ddl' AS type
      FROM db_ddl
      WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${BASE_LIMITS.ddl * 3}
    ),
    doc_matches AS (
      SELECT id, documentation AS content, NULL, NULL,
             NULL,
             1 - (embedding <=> ${embeddingStr}::vector),
             NULL::float,
             'doc'
      FROM db_documentation
      WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${BASE_LIMITS.documentation * 3}
    ),
    example_matches AS (
      SELECT id, NULL, question, sql AS sql_text,
             NULL,
             1 - (embedding <=> ${embeddingStr}::vector),
             NULL::float,
             'example'
      FROM db_question_sql
      WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${BASE_LIMITS.examples * 3}
    ),
    tool_matches AS (
      SELECT id, NULL, question, NULL,
             tool_name,
             1 - (embedding <=> ${embeddingStr}::vector),
             1.0 / (EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 + 1),
             'tool'
      FROM db_tool_memory
      WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
        AND success = TRUE
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${BASE_LIMITS.toolMemory * 3}
    ),
    text_matches AS (
      SELECT id, content, NULL, NULL,
             NULL,
             1 - (embedding <=> ${embeddingStr}::vector),
             NULL::float,
             'text'
      FROM db_text_memory
      WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${BASE_LIMITS.textMemory * 3}
    )
    SELECT * FROM ddl_matches
    UNION ALL SELECT * FROM doc_matches
    UNION ALL SELECT * FROM example_matches
    UNION ALL SELECT * FROM tool_matches
    UNION ALL SELECT * FROM text_matches
  `;

  // Phase 2: Application-side boosting and re-ranking

  // Extract table names from DDL results for boosting
  const ddlRows = rows.filter(
    (r) => r.type === "ddl" && (r.similarity as number) >= MIN_SIMILARITY
  );
  const tableNames = extractTableNames(
    ddlRows.map((r) => r.content as string)
  );

  // Find tables mentioned in question
  const questionLower = question.toLowerCase();
  const mentionedTables = tableNames.filter((t) => {
    const variations = [
      t.toLowerCase(),
      t.toLowerCase().replace(/_/g, " "),
      // Singular/plural
      t.toLowerCase().replace(/s$/, ""),
      t.toLowerCase() + "s",
    ];
    return variations.some((v) => questionLower.includes(v));
  });

  // Build DDL results with table-mention boost
  const ddl = ddlRows
    .map((r) => {
      let score = r.similarity as number;
      if (mentionedTables.length > 0) {
        const contentLower = (r.content as string).toLowerCase();
        if (
          mentionedTables.some((t) => contentLower.includes(t.toLowerCase()))
        ) {
          score += DDL_BOOST;
        }
      }
      return { content: r.content as string, similarity: score };
    })
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);

  // Build doc results with table-reference boost
  const documentation = rows
    .filter((r) => r.type === "doc")
    .map((r) => {
      let score = r.similarity as number;
      if (mentionedTables.length > 0) {
        const contentLower = (r.content as string).toLowerCase();
        if (
          mentionedTables.some((t) => contentLower.includes(t.toLowerCase()))
        ) {
          score += DOC_BOOST;
        }
      }
      return { content: r.content as string, similarity: score };
    })
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);

  // Examples — pure similarity
  const examples = rows
    .filter(
      (r) => r.type === "example" && (r.similarity as number) >= MIN_SIMILARITY
    )
    .map((r) => ({
      question: r.question as string,
      sql: r.sql_text as string,
      similarity: r.similarity as number,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  // Tool memory — weighted: 80% similarity + 20% recency
  const toolMemory = rows
    .filter((r) => r.type === "tool")
    .map((r) => {
      const sim = r.similarity as number;
      const recency = (r.recency_score as number) ?? 0;
      const score =
        TOOL_MEMORY_SIMILARITY_WEIGHT * sim +
        TOOL_MEMORY_RECENCY_WEIGHT * recency;
      return {
        question: r.question as string,
        toolName: r.tool_name as string,
        similarity: score,
      };
    })
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);

  // Text memory — pure similarity
  const textMemory = rows
    .filter(
      (r) => r.type === "text" && (r.similarity as number) >= MIN_SIMILARITY
    )
    .map((r) => ({
      content: r.content as string,
      similarity: r.similarity as number,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  // Apply dynamic limits
  const limits = calculateDynamicLimits({
    ddl: ddl.length,
    documentation: documentation.length,
    examples: examples.length,
    toolMemory: toolMemory.length,
    textMemory: textMemory.length,
  });

  return {
    ddl: ddl.slice(0, limits.ddl),
    documentation: documentation.slice(0, limits.documentation),
    examples: examples.slice(0, limits.examples),
    toolMemory: toolMemory.slice(0, limits.toolMemory),
    textMemory: textMemory.slice(0, limits.textMemory),
  };
}

// --- Save with duplicate detection ---

/**
 * Save tool memory with near-duplicate detection.
 * Returns the saved ID, or null if a near-duplicate exists.
 */
export async function saveToolMemory(
  question: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  success: boolean,
  metadata: Record<string, unknown> | null,
  tenantId: string,
  databaseId: string
): Promise<string | null> {
  const embedding = await generateEmbedding(question);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Check for near-duplicate
  const dupes = await sql`
    SELECT id FROM db_tool_memory
    WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${DUPLICATE_THRESHOLD}
    LIMIT 1
  `;

  if (dupes.length > 0) return null;

  const rows = await sql`
    INSERT INTO db_tool_memory (tenant_id, database_id, question, tool_name, tool_args, success, metadata, embedding)
    VALUES (${tenantId}::uuid, ${databaseId}::uuid, ${question}, ${toolName},
            ${JSON.stringify(toolArgs)}::jsonb, ${success},
            ${metadata ? JSON.stringify(metadata) : null}::jsonb,
            ${embeddingStr}::vector)
    RETURNING id
  `;

  return rows[0].id as string;
}

/**
 * Save text memory with near-duplicate detection.
 * Returns the saved ID, or null if a near-duplicate exists.
 */
export async function saveTextMemory(
  content: string,
  tenantId: string,
  databaseId: string
): Promise<string | null> {
  const embedding = await generateEmbedding(content);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Check for near-duplicate
  const dupes = await sql`
    SELECT id FROM db_text_memory
    WHERE tenant_id = ${tenantId}::uuid AND database_id = ${databaseId}::uuid
      AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${DUPLICATE_THRESHOLD}
    LIMIT 1
  `;

  if (dupes.length > 0) return null;

  const rows = await sql`
    INSERT INTO db_text_memory (tenant_id, database_id, content, embedding)
    VALUES (${tenantId}::uuid, ${databaseId}::uuid, ${content}, ${embeddingStr}::vector)
    RETURNING id
  `;

  return rows[0].id as string;
}

// --- Format for prompt ---

/**
 * Format training data context as markdown sections for the AI prompt.
 */
export function toPromptSections(context: TrainingDataContext): string {
  const sections: string[] = [];

  if (context.ddl.length > 0) {
    sections.push("## Database Schema (DDL)\n");
    for (const d of context.ddl) {
      sections.push(
        `\`\`\`sql\n${d.content}\n\`\`\`\n_(relevance: ${Math.round(d.similarity * 100)}%)_\n`
      );
    }
  }

  if (context.documentation.length > 0) {
    sections.push("## Documentation\n");
    for (const d of context.documentation) {
      sections.push(
        `${d.content}\n_(relevance: ${Math.round(d.similarity * 100)}%)_\n`
      );
    }
  }

  if (context.examples.length > 0) {
    sections.push("## Similar Questions & SQL\n");
    for (const e of context.examples) {
      sections.push(
        `**Q:** ${e.question}\n\`\`\`sql\n${e.sql}\n\`\`\`\n_(relevance: ${Math.round(e.similarity * 100)}%)_\n`
      );
    }
  }

  if (context.toolMemory.length > 0) {
    sections.push("## Past Successful Queries\n");
    for (const t of context.toolMemory) {
      sections.push(
        `- **${t.toolName}**: ${t.question} _(score: ${Math.round(t.similarity * 100)}%)_\n`
      );
    }
  }

  if (context.textMemory.length > 0) {
    sections.push("## Business Context\n");
    for (const t of context.textMemory) {
      sections.push(
        `${t.content}\n_(relevance: ${Math.round(t.similarity * 100)}%)_\n`
      );
    }
  }

  return sections.join("\n");
}

// --- Helpers ---

/**
 * Extract table names from DDL strings.
 */
function extractTableNames(ddls: string[]): string[] {
  const names = new Set<string>();
  for (const ddl of ddls) {
    const matches = ddl.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?(?:"?(\w+)"?)/gi
    );
    for (const m of matches) {
      names.add(m[2] || m[1]);
    }
  }
  return [...names];
}

/**
 * Calculate dynamic limits based on available data.
 * Redistributes unused budget from empty categories.
 */
function calculateDynamicLimits(available: {
  ddl: number;
  documentation: number;
  examples: number;
  toolMemory: number;
  textMemory: number;
}): typeof BASE_LIMITS {
  const limits = { ...BASE_LIMITS };
  const keys = Object.keys(limits) as (keyof typeof limits)[];

  // Calculate surplus from categories with fewer results than their base limit
  let surplus = 0;
  const needMore: (keyof typeof limits)[] = [];

  for (const key of keys) {
    const avail = available[key];
    if (avail < limits[key]) {
      surplus += limits[key] - avail;
      limits[key] = avail;
    } else if (avail > limits[key]) {
      needMore.push(key);
    }
  }

  // Distribute surplus proportionally to categories that have more data
  if (surplus > 0 && needMore.length > 0) {
    const perCategory = Math.floor(surplus / needMore.length);
    let remainder = surplus - perCategory * needMore.length;
    for (const key of needMore) {
      limits[key] += perCategory + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      // Don't exceed available
      limits[key] = Math.min(limits[key], available[key]);
    }
  }

  // Ensure total doesn't exceed budget
  let total = keys.reduce((sum, k) => sum + limits[k], 0);
  while (total > TOTAL_BUDGET) {
    // Trim from largest categories first
    const sorted = keys
      .filter((k) => limits[k] > 0)
      .sort((a, b) => limits[b] - limits[a]);
    if (sorted.length > 0) {
      limits[sorted[0]]--;
      total--;
    }
  }

  return limits;
}
