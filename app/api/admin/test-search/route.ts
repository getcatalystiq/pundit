import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { searchTrainingData, toPromptSections } from "@/lib/rag";
import { resolveDatabaseId } from "@/lib/tenant-db";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const body = await request.json();
  const { question, database } = body;

  if (!question) {
    return jsonResponse({ error: "question is required" }, 400);
  }

  const start = Date.now();
  try {
    const { databaseId, databaseName } = await resolveDatabaseId(
      auth.tenantId,
      database
    );
    const context = await searchTrainingData(question, auth.tenantId, databaseId);
    const sections = toPromptSections(context);

    return jsonResponse({
      database: databaseName,
      latency_ms: Date.now() - start,
      counts: {
        ddl: context.ddl.length,
        documentation: context.documentation.length,
        examples: context.examples.length,
        toolMemory: context.toolMemory.length,
        textMemory: context.textMemory.length,
      },
      sections,
    });
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - start,
    }, 500);
  }
}
