import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { jsonResponse } from "@/lib/utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const rows = await sql`
    SELECT id, name, host, port, database_name, username, ssl_mode,
           is_default, enabled, encryption_key_version, created_at, updated_at
    FROM tenant_databases
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Database not found" }, 404);
  }

  // Get training data counts
  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM db_ddl WHERE database_id = ${id}::uuid) AS ddl_count,
      (SELECT COUNT(*) FROM db_documentation WHERE database_id = ${id}::uuid) AS doc_count,
      (SELECT COUNT(*) FROM db_question_sql WHERE database_id = ${id}::uuid) AS example_count,
      (SELECT COUNT(*) FROM db_tool_memory WHERE database_id = ${id}::uuid) AS memory_count,
      (SELECT COUNT(*) FROM db_text_memory WHERE database_id = ${id}::uuid) AS text_memory_count
  `;

  return jsonResponse({
    database: rows[0],
    training_data: counts[0],
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json();

  const { name, host, port, database_name, username, password, ssl_mode, is_default, enabled } = body;

  // If password is being updated, re-encrypt
  if (password) {
    const aad = `${auth.tenantId}:${id}`;
    const { encrypted, iv, tag } = encrypt(password, aad);
    const rows = await sql`
      UPDATE tenant_databases
      SET
        name = COALESCE(${name ?? null}, name),
        host = COALESCE(${host ?? null}, host),
        port = COALESCE(${port ?? null}, port),
        database_name = COALESCE(${database_name ?? null}, database_name),
        username = COALESCE(${username ?? null}, username),
        encrypted_password = ${encrypted as unknown as string},
        encryption_iv = ${iv as unknown as string},
        encryption_tag = ${tag as unknown as string},
        ssl_mode = COALESCE(${ssl_mode ?? null}, ssl_mode),
        is_default = COALESCE(${is_default ?? null}, is_default),
        enabled = COALESCE(${enabled ?? null}, enabled)
      WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
      RETURNING id, name, host, port, database_name, username, ssl_mode,
                is_default, enabled, encryption_key_version, created_at, updated_at
    `;

    if (rows.length === 0) {
      return jsonResponse({ error: "Database not found" }, 404);
    }

    return jsonResponse({ database: rows[0] });
  }

  // Update without password change
  const rows = await sql`
    UPDATE tenant_databases
    SET
      name = COALESCE(${name ?? null}, name),
      host = COALESCE(${host ?? null}, host),
      port = COALESCE(${port ?? null}, port),
      database_name = COALESCE(${database_name ?? null}, database_name),
      username = COALESCE(${username ?? null}, username),
      ssl_mode = COALESCE(${ssl_mode ?? null}, ssl_mode),
      is_default = COALESCE(${is_default ?? null}, is_default),
      enabled = COALESCE(${enabled ?? null}, enabled)
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
    RETURNING id, name, host, port, database_name, username, ssl_mode,
              is_default, enabled, encryption_key_version, created_at, updated_at
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Database not found" }, 404);
  }

  return jsonResponse({ database: rows[0] });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  // CASCADE will delete all training data (db_ddl, db_documentation, etc.)
  const rows = await sql`
    DELETE FROM tenant_databases
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
    RETURNING id
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Database not found" }, 404);
  }

  return new Response(null, { status: 204 });
}
