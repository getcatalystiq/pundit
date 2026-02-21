import { NextRequest } from "next/server";
import {
  getClient,
  authenticateUser,
  createAuthorizationCode,
  isAllowedAutoRegisterDomain,
  autoRegisterClient,
  oauthError,
} from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const scope = params.get("scope") ?? "read write";
  const state = params.get("state") ?? "";
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  if (!clientId || !redirectUri || responseType !== "code") {
    return oauthError(
      "invalid_request",
      "client_id, redirect_uri, and response_type=code are required"
    );
  }

  if (!codeChallenge) {
    return oauthError("invalid_request", "PKCE code_challenge is required");
  }

  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return oauthError(
      "invalid_request",
      "Only S256 code_challenge_method is supported"
    );
  }

  let client = await getClient(clientId);
  if (!client && isAllowedAutoRegisterDomain(redirectUri)) {
    client = await autoRegisterClient(clientId, redirectUri);
  }
  if (!client) {
    return oauthError("invalid_client", "Unknown client_id");
  }

  const registeredUris = client.redirect_uris as string[];
  if (
    !registeredUris.includes(redirectUri) &&
    !isAllowedAutoRegisterDomain(redirectUri)
  ) {
    return oauthError("invalid_request", "redirect_uri not registered");
  }

  const html = renderLoginForm({
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod ?? "S256",
    clientName: client.client_name as string,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const clientId = formData.get("client_id") as string;
  const redirectUri = formData.get("redirect_uri") as string;
  const scope = formData.get("scope") as string;
  const state = formData.get("state") as string;
  const codeChallenge = formData.get("code_challenge") as string;
  const codeChallengeMethod = formData.get(
    "code_challenge_method"
  ) as string;

  if (!email || !password) {
    return oauthError("invalid_request", "Email and password are required");
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    const html = renderLoginForm({
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      clientName: clientId,
      error: "Invalid email or password",
    });
    return new Response(html, {
      status: 401,
      headers: { "Content-Type": "text/html" },
    });
  }

  const code = await createAuthorizationCode({
    clientId,
    userId: user.id as string,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return Response.redirect(url.toString(), 302);
}

function renderLoginForm(opts: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientName: string;
  error?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Pundit</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #a3a3a3; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .error { background: #7f1d1d; border: 1px solid #991b1b; color: #fca5a5; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.875rem; }
    label { display: block; font-size: 0.875rem; color: #a3a3a3; margin-bottom: 0.25rem; }
    input[type="email"], input[type="password"] { width: 100%; padding: 0.625rem 0.75rem; background: #0a0a0a; border: 1px solid #262626; border-radius: 8px; color: #fafafa; font-size: 0.875rem; margin-bottom: 1rem; outline: none; }
    input:focus { border-color: #525252; }
    button { width: 100%; padding: 0.625rem; background: #fafafa; color: #0a0a0a; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #e5e5e5; }
    .scope { color: #737373; font-size: 0.75rem; margin-top: 1rem; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to Pundit</h1>
    <p class="subtitle">Authorize <strong>${escapeHtml(opts.clientName)}</strong></p>
    ${opts.error ? `<div class="error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="POST">
      <input type="hidden" name="client_id" value="${escapeHtml(opts.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(opts.redirectUri)}">
      <input type="hidden" name="scope" value="${escapeHtml(opts.scope)}">
      <input type="hidden" name="state" value="${escapeHtml(opts.state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(opts.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(opts.codeChallengeMethod)}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <button type="submit">Sign in</button>
    </form>
    <p class="scope">Requested scope: ${escapeHtml(opts.scope)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
