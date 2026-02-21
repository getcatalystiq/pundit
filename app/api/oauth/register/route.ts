import { registerClient, oauthError } from "@/lib/oauth";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "Invalid JSON body");
  }

  const clientName = body.client_name as string | undefined;
  const redirectUris = body.redirect_uris as string[] | undefined;

  if (!clientName || !redirectUris?.length) {
    return oauthError(
      "invalid_client_metadata",
      "client_name and redirect_uris are required"
    );
  }

  for (const uri of redirectUris) {
    try {
      const url = new URL(uri);
      if (
        url.protocol !== "https:" &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      ) {
        return oauthError(
          "invalid_redirect_uri",
          "Redirect URIs must use HTTPS (except localhost)"
        );
      }
    } catch {
      return oauthError("invalid_redirect_uri", `Invalid URI: ${uri}`);
    }
  }

  const result = await registerClient({
    clientName,
    redirectUris,
    grantTypes: body.grant_types as string[] | undefined,
    responseTypes: body.response_types as string[] | undefined,
    tokenEndpointAuthMethod: body.token_endpoint_auth_method as
      | string
      | undefined,
    scope: body.scope as string | undefined,
  });

  return jsonResponse(result, 201);
}
