import { extractBearerToken, verifyAccessToken } from "@/lib/oauth";
import { jsonResponse } from "@/lib/utils";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const token = extractBearerToken(request);
  if (!token) {
    return jsonResponse(
      { error: "invalid_token", error_description: "Bearer token required" },
      401
    );
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return jsonResponse(
      {
        error: "invalid_token",
        error_description: "Invalid or expired token",
      },
      401
    );
  }

  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role, u.scopes, t.name as tenant_name, t.slug as tenant_slug
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ${payload.sub}::uuid AND u.is_active = TRUE
  `;

  if (rows.length === 0) {
    return jsonResponse(
      { error: "invalid_token", error_description: "User not found" },
      401
    );
  }

  const user = rows[0];
  return jsonResponse({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopes: user.scopes,
    tenant_name: user.tenant_name,
    tenant_slug: user.tenant_slug,
  });
}
