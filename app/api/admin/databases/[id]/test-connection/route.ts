import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/tenant-db";
import { jsonResponse } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const rows = await sql`
    SELECT * FROM tenant_databases
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "Database not found" }, 404);
  }

  const db = rows[0];

  // Decrypt password with AAD
  const aad = `${auth.tenantId}:${db.id}`;
  const password = decrypt(
    db.encrypted_password as Buffer,
    db.encryption_iv as Buffer,
    db.encryption_tag as Buffer,
    aad
  );

  const result = await testConnection(
    db.host as string,
    db.port as number,
    db.database_name as string,
    db.username as string,
    password,
    db.ssl_mode as string
  );

  return jsonResponse(result);
}
