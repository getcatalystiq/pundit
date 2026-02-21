import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { generateSampleQueries } from "@/lib/ai-generator";
import { generateEmbedding } from "@/lib/embeddings";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const { num_queries, auto_save } = body as {
    num_queries?: number;
    auto_save?: boolean;
  };

  // Get DDL for this database
  const ddlRows = await sql`
    SELECT ddl FROM db_ddl
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
  `;

  if (ddlRows.length === 0) {
    return jsonResponse(
      { error: "No DDL found. Run pull-ddl first." },
      400
    );
  }

  // Use combined DDL for context but limit query count
  const combinedDdl = ddlRows.map((r) => r.ddl).join("\n\n");
  const queriesPerBatch = num_queries ?? 5;

  let queries: Array<{ question: string; sql: string }>;
  try {
    queries = await generateSampleQueries(combinedDdl, queriesPerBatch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI generation failed:", message);
    return jsonResponse({ error: `AI generation failed: ${message}` }, 502);
  }

  if (!auto_save) {
    return jsonResponse({ examples: queries });
  }

  // Save individually to avoid batch embedding timeout
  let savedCount = 0;
  for (const q of queries) {
    try {
      const embedding = await generateEmbedding(q.question);
      const embeddingStr = `[${embedding.join(",")}]`;
      await sql`
        INSERT INTO db_question_sql (tenant_id, database_id, question, sql, embedding)
        VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${q.question}, ${q.sql}, ${embeddingStr}::vector)
      `;
      savedCount++;
    } catch (err) {
      console.error("Failed to save example:", err instanceof Error ? err.message : err);
    }
  }

  return jsonResponse({
    examples: queries,
    saved: true,
    count: savedCount,
  });
}
