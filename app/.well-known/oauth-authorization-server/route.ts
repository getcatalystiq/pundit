export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;

  return new Response(
    JSON.stringify({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
      token_endpoint: `${baseUrl}/api/oauth/token`,
      registration_endpoint: `${baseUrl}/api/oauth/register`,
      userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["read", "write", "admin"],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
