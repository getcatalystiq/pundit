import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/tenant-db";
import { jsonResponse } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const rows = await sql`
    SELECT id, name, host, port, database_name, username, ssl_mode,
           is_default, enabled, encryption_key_version, created_at, updated_at
    FROM tenant_databases
    WHERE tenant_id = ${auth.tenantId}::uuid
    ORDER BY is_default DESC, name ASC
  `;

  return jsonResponse({ databases: rows });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const body = await request.json();
  const { name, host, port, database_name, username, password, ssl_mode, is_default } = body;

  if (!name || !host || !database_name || !username || !password) {
    return jsonResponse(
      { error: "name, host, database_name, username, and password are required" },
      400
    );
  }

  // Test connection before saving
  const test = await testConnection(
    host,
    port ?? 5432,
    database_name,
    username,
    password,
    ssl_mode
  );

  if (!test.success) {
    return jsonResponse(
      { error: `Connection failed: ${test.error}` },
      400
    );
  }

  // Insert first to get the ID for AAD
  const tempRows = await sql`
    INSERT INTO tenant_databases (
      tenant_id, name, host, port, database_name, username,
      encrypted_password, encryption_iv, encryption_tag,
      ssl_mode, is_default
    )
    VALUES (
      ${auth.tenantId}::uuid, ${name}, ${host}, ${port ?? 5432},
      ${database_name}, ${username},
      '\\x00', '\\x00', '\\x00',
      ${ssl_mode ?? "require"}, ${is_default ?? false}
    )
    RETURNING id
  `;
  const dbId = tempRows[0].id as string;

  // Encrypt password with AAD (tenant_id:database_id)
  const aad = `${auth.tenantId}:${dbId}`;
  const { encrypted, iv, tag } = encrypt(password, aad);

  // Update with encrypted credentials
  const rows = await sql`
    UPDATE tenant_databases
    SET encrypted_password = ${encrypted as unknown as string},
        encryption_iv = ${iv as unknown as string},
        encryption_tag = ${tag as unknown as string}
    WHERE id = ${dbId}::uuid
    RETURNING id, name, host, port, database_name, username, ssl_mode,
              is_default, enabled, encryption_key_version, created_at, updated_at
  `;

  return jsonResponse(
    { database: rows[0], connection_test: { version: test.version, latency_ms: test.latency_ms } },
    201
  );
}
