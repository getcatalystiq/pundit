import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";
import bcrypt from "bcryptjs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const rows = await sql`
    SELECT id, email, name, role, scopes, is_active, last_login_at, created_at
    FROM users
    WHERE tenant_id = ${auth.tenantId}::uuid
    ORDER BY created_at DESC
  `;

  return jsonResponse({ users: rows });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const body = await request.json();
  const { email, password, name, role, scopes } = body;

  if (!email || !password) {
    return jsonResponse({ error: "email and password are required" }, 400);
  }

  if (password.length < 12) {
    return jsonResponse({ error: "Password must be at least 12 characters" }, 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const rows = await sql`
      INSERT INTO users (tenant_id, email, password_hash, name, role, scopes)
      VALUES (${auth.tenantId}::uuid, ${email}, ${passwordHash},
              ${name ?? null}, ${role ?? "member"},
              ${scopes ?? ["read", "write"]})
      RETURNING id, email, name, role, scopes, is_active, created_at
    `;

    return jsonResponse({ user: rows[0] }, 201);
  } catch (e) {
    if (String(e).includes("unique")) {
      return jsonResponse({ error: "A user with this email already exists" }, 409);
    }
    throw e;
  }
}
