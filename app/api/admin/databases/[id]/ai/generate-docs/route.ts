import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { generateDocumentation } from "@/lib/ai-generator";
import { generateEmbeddings } from "@/lib/embeddings";
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

  // Get DDL for this database
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

  const combinedDdl = ddlRows.map((r) => r.ddl).join("\n\n");
  const documentation = await generateDocumentation(combinedDdl);

  if (!auto_save) {
    return jsonResponse({ documentation });
  }

  // Save each table's documentation with embeddings
  const docTexts = Object.values(documentation);
  const embeddings = await generateEmbeddings(docTexts);
  const entries = Object.entries(documentation);

  for (let i = 0; i < entries.length; i++) {
    const [, docText] = entries[i];
    const embeddingStr = `[${embeddings[i].join(",")}]`;
    await sql`
      INSERT INTO db_documentation (tenant_id, database_id, documentation, embedding)
      VALUES (${auth.tenantId}::uuid, ${id}::uuid, ${docText}, ${embeddingStr}::vector)
    `;
  }

  return jsonResponse({
    documentation,
    saved: true,
    count: entries.length,
  });
}
