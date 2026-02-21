import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  extractClientCredentials,
  getClient,
  verifyClientSecret,
  oauthError,
} from "@/lib/oauth";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, string>;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    return oauthError("invalid_request", "Unsupported content type");
  }

  const grantType = body.grant_type;
  if (!grantType) {
    return oauthError("invalid_request", "grant_type is required");
  }

  const { clientId, clientSecret } = extractClientCredentials(request, body);
  if (!clientId) {
    return oauthError("invalid_client", "client_id is required");
  }

  const client = await getClient(clientId);
  if (!client) {
    return oauthError("invalid_client", "Unknown client");
  }

  const authMethod = client.token_endpoint_auth_method as string;
  if (authMethod !== "none") {
    if (!clientSecret) {
      return oauthError("invalid_client", "Client secret required");
    }
    const valid = await verifyClientSecret(clientId, clientSecret);
    if (!valid) {
      return oauthError("invalid_client", "Invalid client credentials");
    }
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(body, clientId);
  } else if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(body, clientId);
  } else {
    return oauthError("unsupported_grant_type", `Unsupported: ${grantType}`);
  }
}

async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  clientId: string
) {
  const code = body.code;
  const codeVerifier = body.code_verifier;
  const redirectUri = body.redirect_uri;

  if (!code || !codeVerifier || !redirectUri) {
    return oauthError(
      "invalid_request",
      "code, code_verifier, and redirect_uri are required"
    );
  }

  const result = await exchangeAuthorizationCode(
    code,
    clientId,
    codeVerifier,
    redirectUri
  );

  if (!result) {
    return oauthError(
      "invalid_grant",
      "Invalid or expired authorization code"
    );
  }

  return jsonResponse({
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    refresh_token: result.refreshToken,
    scope: result.scope,
  });
}

async function handleRefreshTokenGrant(
  body: Record<string, string>,
  clientId: string
) {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return oauthError("invalid_request", "refresh_token is required");
  }

  const result = await exchangeRefreshToken(refreshToken, clientId);
  if (!result) {
    return oauthError("invalid_grant", "Invalid or expired refresh token");
  }

  return jsonResponse({
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    refresh_token: result.refreshToken,
    scope: result.scope,
  });
}
