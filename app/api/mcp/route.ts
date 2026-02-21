import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAccessToken } from "@/lib/oauth";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp-tools";
import { toolContextStorage } from "@/lib/request-context";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { instructions: SERVER_INSTRUCTIONS },
  { basePath: "/api", maxDuration: 60 }
);

const authHandler = withMcpAuth(
  (req) => {
    // Wrap in AsyncLocalStorage for request-scoped tool context
    return toolContextStorage.run({}, () => handler(req));
  },
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    try {
      const payload = await verifyAccessToken(bearerToken);
      return {
        token: bearerToken,
        scopes: payload.scope.split(" "),
        clientId: payload.client_id,
        extra: {
          userId: payload.sub,
          tenantId: payload.tenant_id,
        },
      };
    } catch {
      return undefined;
    }
  },
  { required: true }
);

export { authHandler as GET, authHandler as POST };
