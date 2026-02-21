import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { generateSampleQueries } from "@/lib/ai-generator";
import { generateEmbeddings } from "@/lib/embeddings";
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

  const combinedDdl = ddlRows.map((r) => r.ddl).join("\n\n");

  let queries: Array<{ question: string; sql: string }>;
  try {
    queries = await generateSampleQueries(combinedDdl, num_queries ?? 5);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI generation failed:", message);
    return jsonResponse({ error: `AI generation failed: ${message}` }, 502);
  }

  if (!auto_save) {
    return jsonResponse({ examples: queries });
  }

  // Save with embeddings (embed the questions)
  const questions = queries.map((q) => q.question);

  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(questions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Embedding generation failed:", message);
    return jsonResponse({ error: `Embedding generation failed: ${message}` }, 502);
  }

  for (let i = 0; i < queries.length; i++) {
    const embeddingStr = `[${embeddings[i].join(",")}]`;
    await sql`
      INSERT INTO db_question_sql (tenant_id, database_id, question, sql, embedding)
      VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${queries[i].question}, ${queries[i].sql}, ${embeddingStr}::vector)
    `;
  }

  return jsonResponse({
    examples: queries,
    saved: true,
    count: queries.length,
  });
}
