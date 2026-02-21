import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { name, role, scopes, is_active } = body;

  const rows = await sql`
    UPDATE users
    SET
      name = COALESCE(${name ?? null}, name),
      role = COALESCE(${role ?? null}, role),
      scopes = COALESCE(${scopes ?? null}, scopes),
      is_active = COALESCE(${is_active ?? null}, is_active)
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
    RETURNING id, email, name, role, scopes, is_active, created_at
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  return jsonResponse({ user: rows[0] });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  // Prevent self-deletion
  if (id === auth.userId) {
    return jsonResponse({ error: "Cannot delete your own account" }, 400);
  }

  const rows = await sql`
    DELETE FROM users
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
