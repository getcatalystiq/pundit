import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";
import { jsonResponse } from "@/lib/utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const rows = await sql`
    SELECT id, question, sql, created_at
    FROM db_question_sql
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ examples: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { question, sql: sqlText } = body;
  if (!question || !sqlText) {
    return jsonResponse({ error: "question and sql are required" }, 400);
  }

  // Embed the question (not the SQL) for similarity search
  let embedding: number[];
  try {
    embedding = await generateEmbedding(question);
  } catch (e) {
    return jsonResponse(
      { error: `Embedding generation failed: ${e instanceof Error ? e.message : "Unknown error"}` },
      500
    );
  }

  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await sql`
    INSERT INTO db_question_sql (tenant_id, database_id, question, sql, embedding)
    VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${question}, ${sqlText}, ${embeddingStr}::vector)
    RETURNING id, question, sql, created_at
  `;

  return jsonResponse({ example: rows[0] }, 201);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const exampleId = url.searchParams.get("exampleId");
  if (!exampleId) {
    return jsonResponse({ error: "exampleId query parameter required" }, 400);
  }

  const rows = await sql`
    DELETE FROM db_question_sql
    WHERE id = ${exampleId}::uuid AND tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Example not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
