import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { analyzeSchema } from "@/lib/ai-generator";
import { jsonResponse } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

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
  const analysis = await analyzeSchema(combinedDdl);

  return jsonResponse({ analysis });
}
