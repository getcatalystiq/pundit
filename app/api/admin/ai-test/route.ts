import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { generateText, gateway } from "ai";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const start = Date.now();
  try {
    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-6"),
      prompt: "Say hello in one word.",
      maxOutputTokens: 10,
    });
    return jsonResponse({
      ok: true,
      text,
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({
      ok: false,
      error: message,
      latency_ms: Date.now() - start,
    }, 502);
  }
}
