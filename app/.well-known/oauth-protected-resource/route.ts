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
      resource: baseUrl,
      authorization_servers: [baseUrl],
      scopes_supported: ["read", "write", "admin"],
      bearer_methods_supported: ["header"],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
