import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { searchTrainingData, toPromptSections } from "@/lib/rag";
import { generateEmbedding } from "@/lib/embeddings";
import { resolveDatabaseId } from "@/lib/tenant-db";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const body = await request.json();
  const { question, database, debug } = body;

  if (!question) {
    return jsonResponse({ error: "question is required" }, 400);
  }

  const start = Date.now();
  try {
    const { databaseId, databaseName } = await resolveDatabaseId(
      auth.tenantId,
      database
    );

    // Debug mode: check embeddings and raw similarity scores
    if (debug) {
      const embedding = await generateEmbedding(question);
      const embeddingStr = `[${embedding.join(",")}]`;

      // Check stored embedding dimensions
      const storedDims = await sql`
        SELECT 'ddl' AS type, vector_dims(embedding) AS dims, COUNT(*) AS count
        FROM db_ddl
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        GROUP BY vector_dims(embedding)
        UNION ALL
        SELECT 'doc', vector_dims(embedding), COUNT(*)
        FROM db_documentation
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        GROUP BY vector_dims(embedding)
        UNION ALL
        SELECT 'example', vector_dims(embedding), COUNT(*)
        FROM db_question_sql
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        GROUP BY vector_dims(embedding)
      `;

      // Get raw similarity scores (no filter)
      const rawScores = await sql`
        SELECT 'ddl' AS type, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM db_ddl
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        ORDER BY similarity DESC
        LIMIT 3
      `;

      const rawDocScores = await sql`
        SELECT 'doc' AS type, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM db_documentation
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        ORDER BY similarity DESC
        LIMIT 3
      `;

      const rawExampleScores = await sql`
        SELECT 'example' AS type, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM db_question_sql
        WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${databaseId}::uuid
        ORDER BY similarity DESC
        LIMIT 3
      `;

      return jsonResponse({
        database: databaseName,
        latency_ms: Date.now() - start,
        query_embedding_dims: embedding.length,
        query_embedding_sample: embedding.slice(0, 5),
        stored_dims: storedDims,
        raw_similarity_scores: {
          ddl: rawScores,
          doc: rawDocScores,
          example: rawExampleScores,
        },
      });
    }

    const context = await searchTrainingData(question, auth.tenantId, databaseId);
    const sections = toPromptSections(context);

    return jsonResponse({
      database: databaseName,
      latency_ms: Date.now() - start,
      counts: {
        ddl: context.ddl.length,
        documentation: context.documentation.length,
        examples: context.examples.length,
        toolMemory: context.toolMemory.length,
        textMemory: context.textMemory.length,
      },
      sections,
    });
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - start,
    }, 500);
  }
}
