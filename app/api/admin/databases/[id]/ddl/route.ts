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
    SELECT id, ddl, created_at
    FROM db_ddl
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ ddl: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { ddl } = body;
  if (!ddl || typeof ddl !== "string") {
    return jsonResponse({ error: "ddl is required" }, 400);
  }

  let embedding: number[];
  try {
    embedding = await generateEmbedding(ddl);
  } catch (e) {
    return jsonResponse(
      { error: `Embedding generation failed: ${e instanceof Error ? e.message : "Unknown error"}` },
      500
    );
  }

  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await sql`
    INSERT INTO db_ddl (tenant_id, database_id, ddl, embedding)
    VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${ddl}, ${embeddingStr}::vector)
    RETURNING id, ddl, created_at
  `;

  return jsonResponse({ ddl: rows[0] }, 201);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const ddlId = url.searchParams.get("ddlId");
  if (!ddlId) {
    return jsonResponse({ error: "ddlId query parameter required" }, 400);
  }

  const rows = await sql`
    DELETE FROM db_ddl
    WHERE id = ${ddlId}::uuid AND tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "DDL entry not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
