import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sql, withTransaction } from "@/lib/db";

// --- Environment (lazy-initialized to avoid build-time errors) ---

let _jwtSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET ?? "";
    if (secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
    _jwtSecret = new TextEncoder().encode(secret);
  }
  return _jwtSecret;
}

function getIssuer(): string {
  return (
    process.env.NEXT_PUBLIC_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

function getAllowedDcrDomains(): string[] {
  return (
    process.env.ALLOWED_DCR_DOMAINS ?? "claude.ai,localhost,127.0.0.1"
  ).split(",");
}

const ACCESS_TOKEN_EXPIRE_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRE_DAYS = 30;
const AUTH_CODE_EXPIRE_MINUTES = 10;

// --- PKCE (S256 only per OAuth 2.1) ---

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function verifyCodeChallenge(
  verifier: string,
  challenge: string
): boolean {
  const computed = generateCodeChallenge(verifier);
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- JWT ---

const AccessTokenPayload = z.object({
  sub: z.string(),
  tenant_id: z.string(),
  scope: z.string(),
  client_id: z.string(),
  token_type: z.literal("access_token"),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayload>;

export async function createAccessToken(opts: {
  userId: string;
  tenantId: string;
  scope: string;
  clientId: string;
}): Promise<string> {
  return new SignJWT({
    sub: opts.userId,
    tenant_id: opts.tenantId,
    scope: opts.scope,
    client_id: opts.clientId,
    token_type: "access_token" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(getIssuer())
    .setAudience(getIssuer())
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: getIssuer(),
    audience: getIssuer(),
  });
  return AccessTokenPayload.parse(payload);
}

export function createRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

// --- Password Hashing ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- Bearer Token Extraction ---

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// --- User Auth ---

export async function authenticateUser(
  email: string,
  password: string
): Promise<Record<string, unknown> | null> {
  const rows = await sql`
    SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.scopes, u.is_active
    FROM users u
    WHERE u.email = ${email} AND u.is_active = TRUE
  `;
  if (rows.length === 0) return null;

  const user = rows[0];
  const valid = await verifyPassword(password, user.password_hash as string);
  if (!valid) return null;

  await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}::uuid`;

  const { password_hash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// --- Tenant/User Signup (transactional) ---

export async function signup(
  tenantName: string,
  email: string,
  password: string,
  userName?: string
): Promise<{
  tenant: Record<string, unknown>;
  user: Record<string, unknown>;
}> {
  const slug =
    tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    crypto.randomBytes(3).toString("hex");

  const passwordHash = await hashPassword(password);

  return withTransaction(async (client) => {
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, email)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, email, created_at`,
      [tenantName, slug, email]
    );
    const tenant = tenantResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role, scopes)
       VALUES ($1, $2, $3, $4, 'owner', ARRAY['read', 'write', 'admin'])
       RETURNING id, tenant_id, email, name, role, scopes, created_at`,
      [tenant.id, email, passwordHash, userName ?? tenantName]
    );
    const user = userResult.rows[0];

    return { tenant, user };
  });
}

// --- Dynamic Client Registration ---

export async function registerClient(opts: {
  clientName: string;
  redirectUris: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  tokenEndpointAuthMethod?: string;
  scope?: string;
  tenantId?: string;
}): Promise<Record<string, unknown>> {
  const clientId = `pundit_${crypto.randomBytes(16).toString("hex")}`;
  const authMethod = opts.tokenEndpointAuthMethod ?? "none";
  const grantTypes = opts.grantTypes ?? [
    "authorization_code",
    "refresh_token",
  ];
  const responseTypes = opts.responseTypes ?? ["code"];
  const scope = opts.scope ?? "read write";

  let clientSecretHash: string | null = null;
  let clientSecret: string | null = null;
  if (authMethod !== "none") {
    clientSecret = crypto.randomBytes(32).toString("hex");
    clientSecretHash = await bcrypt.hash(clientSecret, 10);
  }

  await sql`
    INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope, tenant_id)
    VALUES (
      ${clientId},
      ${clientSecretHash},
      ${opts.clientName},
      ${opts.redirectUris},
      ${grantTypes},
      ${responseTypes},
      ${authMethod},
      ${scope},
      ${opts.tenantId ?? null}
    )
  `;

  const response: Record<string, unknown> = {
    client_id: clientId,
    client_name: opts.clientName,
    redirect_uris: opts.redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
    scope,
  };

  if (clientSecret) {
    response.client_secret = clientSecret;
    response.client_secret_expires_at = 0;
  }

  return response;
}

export async function getClient(
  clientId: string
): Promise<Record<string, unknown> | null> {
  const rows = await sql`
    SELECT * FROM oauth_clients WHERE client_id = ${clientId} AND is_active = TRUE
  `;
  return rows.length > 0 ? rows[0] : null;
}

export async function verifyClientSecret(
  clientId: string,
  clientSecret: string
): Promise<boolean> {
  const client = await getClient(clientId);
  if (!client || !client.client_secret_hash) return false;
  return bcrypt.compare(clientSecret, client.client_secret_hash as string);
}

// --- Authorization Code ---

export async function createAuthorizationCode(opts: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + AUTH_CODE_EXPIRE_MINUTES * 60 * 1000
  );

  await sql`
    INSERT INTO oauth_authorization_codes (code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at)
    VALUES (${code}, ${opts.clientId}, ${opts.userId}::uuid, ${opts.redirectUri}, ${opts.scope}, ${opts.codeChallenge}, ${opts.codeChallengeMethod}, ${expiresAt.toISOString()})
  `;

  return code;
}

// Transactional code exchange — prevents race conditions (SpecFlow Gap 35)
export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
} | null> {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT ac.*, u.tenant_id
       FROM oauth_authorization_codes ac
       JOIN users u ON u.id = ac.user_id
       WHERE ac.code = $1
         AND ac.client_id = $2
         AND ac.used_at IS NULL
         AND ac.expires_at > NOW()
       FOR UPDATE`,
      [code, clientId]
    );

    if (result.rows.length === 0) return null;
    const authCode = result.rows[0];

    if (authCode.redirect_uri !== redirectUri) return null;

    if (
      authCode.code_challenge &&
      !verifyCodeChallenge(codeVerifier, authCode.code_challenge)
    ) {
      return null;
    }

    // Mark as used atomically
    await client.query(
      `UPDATE oauth_authorization_codes SET used_at = NOW() WHERE code = $1`,
      [code]
    );

    const accessToken = await createAccessToken({
      userId: authCode.user_id,
      tenantId: authCode.tenant_id,
      scope: authCode.scope,
      clientId,
    });

    const refresh = createRefreshToken();
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000
    );

    await client.query(
      `INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [refresh.hash, clientId, authCode.user_id, authCode.scope, expiresAt.toISOString()]
    );

    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: ACCESS_TOKEN_EXPIRE_SECONDS,
      scope: authCode.scope,
    };
  });
}

// Transactional refresh token exchange — prevents race conditions (SpecFlow Gap 33)
export async function exchangeRefreshToken(
  refreshToken: string,
  clientId: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
} | null> {
  const hash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT rt.*, u.tenant_id
       FROM oauth_refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.client_id = $2
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
       FOR UPDATE`,
      [hash, clientId]
    );

    if (result.rows.length === 0) return null;
    const token = result.rows[0];

    // Revoke old token atomically
    await client.query(
      `UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [hash]
    );

    const accessToken = await createAccessToken({
      userId: token.user_id,
      tenantId: token.tenant_id,
      scope: token.scope,
      clientId,
    });

    const newRefresh = createRefreshToken();
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000
    );

    await client.query(
      `INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [newRefresh.hash, clientId, token.user_id, token.scope, expiresAt.toISOString()]
    );

    return {
      accessToken,
      refreshToken: newRefresh.token,
      expiresIn: ACCESS_TOKEN_EXPIRE_SECONDS,
      scope: token.scope,
    };
  });
}

// --- JIT DCR (Just-in-time client registration) ---

export function isAllowedAutoRegisterDomain(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    return getAllowedDcrDomains().some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function autoRegisterClient(
  clientId: string,
  redirectUri: string
): Promise<Record<string, unknown>> {
  const existing = await getClient(clientId);
  if (existing) return existing;

  await sql`
    INSERT INTO oauth_clients (client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope)
    VALUES (
      ${clientId},
      ${clientId},
      ${[redirectUri]},
      ARRAY['authorization_code', 'refresh_token'],
      ARRAY['code'],
      'none',
      'read write'
    )
    ON CONFLICT (client_id) DO NOTHING
  `;

  return (await getClient(clientId))!;
}

// --- Helpers ---

export function extractClientCredentials(
  request: Request,
  body: Record<string, string>
): { clientId: string | null; clientSecret: string | null } {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    const [clientId, clientSecret] = decoded.split(":");
    return { clientId: clientId ?? null, clientSecret: clientSecret ?? null };
  }
  return {
    clientId: body.client_id ?? null,
    clientSecret: body.client_secret ?? null,
  };
}

export function oauthError(
  error: string,
  description: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

export { getIssuer as ISSUER, getAllowedDcrDomains as ALLOWED_DCR_DOMAINS };
