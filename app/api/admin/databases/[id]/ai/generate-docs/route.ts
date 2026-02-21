import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { generateDocumentation } from "@/lib/ai-generator";
import { generateEmbedding } from "@/lib/embeddings";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const { auto_save } = body as { auto_save?: boolean };

  const ddlRows = await sql`
    SELECT ddl FROM db_ddl
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
  `;

  if (ddlRows.length === 0) {
    return jsonResponse({ error: "No DDL found. Run pull-ddl first." }, 400);
  }

  // Generate docs for all DDL entries in parallel
  const results = await Promise.allSettled(
    ddlRows.map((row) => generateDocumentation(row.ddl as string))
  );

  const allDocs: Record<string, string> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      Object.assign(allDocs, result.value);
    }
  }

  if (Object.keys(allDocs).length === 0) {
    return jsonResponse({ error: "AI generation failed for all DDL entries" }, 502);
  }

  if (!auto_save) {
    return jsonResponse({ documentation: allDocs });
  }

  // Embed and save all docs in parallel
  const entries = Object.entries(allDocs);
  const saveResults = await Promise.allSettled(
    entries.map(async ([, docText]) => {
      const embedding = await generateEmbedding(docText);
      const embeddingStr = `[${embedding.join(",")}]`;
      await sql`
        INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
        VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${docText}, ${embeddingStr}::vector)
      `;
    })
  );

  const savedCount = saveResults.filter((r) => r.status === "fulfilled").length;

  return jsonResponse({
    documentation: allDocs,
    saved: true,
    count: savedCount,
  });
}
