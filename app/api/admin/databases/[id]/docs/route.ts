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
    SELECT id, documentation, created_at, updated_at
    FROM db_documentation
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ documentation: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { documentation } = body;
  if (!documentation || typeof documentation !== "string") {
    return jsonResponse({ error: "documentation is required" }, 400);
  }

  let embedding: number[];
  try {
    embedding = await generateEmbedding(documentation);
  } catch (e) {
    return jsonResponse(
      { error: `Embedding generation failed: ${e instanceof Error ? e.message : "Unknown error"}` },
      500
    );
  }

  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await sql`
    INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
    VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${documentation}, ${embeddingStr}::vector)
    RETURNING id, documentation, created_at, updated_at
  `;

  return jsonResponse({ documentation: rows[0] }, 201);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const docId = url.searchParams.get("docId");
  if (!docId) {
    return jsonResponse({ error: "docId query parameter required" }, 400);
  }

  const rows = await sql`
    DELETE FROM db_documentation
    WHERE id = ${docId}::uuid AND tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Documentation entry not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
