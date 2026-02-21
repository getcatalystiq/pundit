import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";

// Tool memory is auto-saved via MCP tools — admin can only read and delete

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const rows = await sql`
    SELECT id, question, tool_name, tool_args, success, metadata, created_at
    FROM db_tool_memory
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ toolMemory: rows });
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
    DELETE FROM db_tool_memory
    WHERE id = ${memoryId}::uuid AND tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Tool memory not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
