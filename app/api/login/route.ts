import {
  authenticateUser,
  createAccessToken,
  createRefreshToken,
  oauthError,
} from "@/lib/oauth";
import { jsonResponse } from "@/lib/utils";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "Invalid JSON body");
  }

  const { email, password } = body;
  if (!email || !password) {
    return oauthError("invalid_request", "Email and password are required");
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return oauthError("invalid_grant", "Invalid email or password", 401);
  }

  const accessToken = await createAccessToken({
    userId: user.id as string,
    tenantId: user.tenant_id as string,
    scope: (user.scopes as string[]).join(" "),
    clientId: "pundit-admin",
  });

  const refresh = createRefreshToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, expires_at)
    VALUES (${refresh.hash}, 'pundit-admin', ${user.id}::uuid, ${(user.scopes as string[]).join(" ")}, ${expiresAt.toISOString()})
  `;

  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh.token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      scopes: user.scopes,
    },
  });
}
