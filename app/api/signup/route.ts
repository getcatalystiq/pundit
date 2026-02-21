import { signup, oauthError } from "@/lib/oauth";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "Invalid JSON body");
  }

  const { tenant_name, email, password, name } = body;

  if (!tenant_name || !email || !password) {
    return oauthError(
      "invalid_request",
      "tenant_name, email, and password are required"
    );
  }

  if (password.length < 12) {
    return oauthError(
      "invalid_request",
      "Password must be at least 12 characters"
    );
  }

  try {
    const result = await signup(tenant_name, email, password, name);
    return jsonResponse(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    if (message.includes("duplicate") || message.includes("unique")) {
      return oauthError("invalid_request", "Email or tenant already exists");
    }
    return oauthError("server_error", message, 500);
  }
}
