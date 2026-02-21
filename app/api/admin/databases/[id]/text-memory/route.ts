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
    SELECT id, content, created_at
    FROM db_text_memory
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ textMemory: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { content } = body;
  if (!content || typeof content !== "string") {
    return jsonResponse({ error: "content is required" }, 400);
  }

  let embedding: number[];
  try {
    embedding = await generateEmbedding(content);
  } catch (e) {
    return jsonResponse(
      { error: `Embedding generation failed: ${e instanceof Error ? e.message : "Unknown error"}` },
      500
    );
  }

  const embeddingStr = `[${embedding.join(",")}]`;

  // Near-duplicate detection
  const dupes = await sql`
    SELECT id FROM db_text_memory
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
      AND 1 - (embedding <=> ${embeddingStr}::vector) >= 0.95
    LIMIT 1
  `;

  if (dupes.length > 0) {
    return jsonResponse(
      { error: "Near-duplicate content already exists", duplicate_id: dupes[0].id },
      409
    );
  }

  const rows = await sql`
    INSERT INTO db_text_memory (tenant_id, database_id, content, embedding)
    VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${content}, ${embeddingStr}::vector)
    RETURNING id, content, created_at
  `;

  return jsonResponse({ textMemory: rows[0] }, 201);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const memoryId = url.searchParams.get("memoryId");
  if (!memoryId) {
    return jsonResponse({ error: "memoryId query parameter required" }, 400);
  }

  const rows = await sql`
    DELETE FROM db_text_memory
    WHERE id = ${memoryId}::uuid AND tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Text memory not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
