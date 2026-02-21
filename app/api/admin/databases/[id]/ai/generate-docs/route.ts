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

  // Get DDL entries for this database
  const ddlRows = await sql`
    SELECT ddl FROM db_ddl
    WHERE tenant_id = ${auth.tenantId}::uuid AND database_id = ${id}::uuid
  `;

  if (ddlRows.length === 0) {
    return jsonResponse(
      { error: "No DDL found. Run pull-ddl first." },
      400
    );
  }

  // Process each DDL entry individually to avoid timeouts
  const allDocs: Record<string, string> = {};
  let savedCount = 0;

  for (const row of ddlRows) {
    const ddl = row.ddl as string;

    let docs: Record<string, string>;
    try {
      docs = await generateDocumentation(ddl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("AI generation failed for DDL entry:", message);
      continue;
    }

    Object.assign(allDocs, docs);

    if (auto_save) {
      for (const [, docText] of Object.entries(docs)) {
        try {
          const embedding = await generateEmbedding(docText);
          const embeddingStr = `[${embedding.join(",")}]`;
          await sql`
            INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
            VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${docText}, ${embeddingStr}::vector)
          `;
          savedCount++;
        } catch (err) {
          console.error("Failed to save doc entry:", err instanceof Error ? err.message : err);
        }
      }
    }
  }

  if (Object.keys(allDocs).length === 0) {
    return jsonResponse({ error: "AI generation failed for all DDL entries" }, 502);
  }

  return jsonResponse({
    documentation: allDocs,
    ...(auto_save ? { saved: true, count: savedCount } : {}),
  });
}
