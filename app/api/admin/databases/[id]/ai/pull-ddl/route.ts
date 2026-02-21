import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql, withTransaction } from "@/lib/db";
import { connectTenantDb } from "@/lib/tenant-db";
import { introspectSchema } from "@/lib/schema-introspector";
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

  const { schema, tables, auto_save } = body as {
    schema?: string;
    tables?: string[];
    auto_save?: boolean;
  };

  // Verify database belongs to tenant
  const dbRows = await sql`
    SELECT id FROM tenant_databases
    WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid AND enabled = TRUE
  `;
  if (dbRows.length === 0) {
    return jsonResponse({ error: "Database not found" }, 404);
  }

  // Connect and introspect
  const conn = await connectTenantDb(auth.tenantId, undefined);
  try {
    // We need to connect to the specific database by ID, not by name
    // Re-connect using the right database
    await conn.close();
  } catch {
    // ignore close errors
  }

  // Connect to the actual tenant database
  let tenantConn;
  try {
    // Get the database name for this ID
    const nameRows = await sql`
      SELECT name FROM tenant_databases WHERE id = ${id}::uuid
    `;
    tenantConn = await connectTenantDb(auth.tenantId, nameRows[0].name as string);

    const ddlMap = await introspectSchema(tenantConn, schema ?? "public", tables);

    if (!auto_save) {
      return jsonResponse({ ddl: ddlMap, table_count: Object.keys(ddlMap).length });
    }

    // Auto-save: generate embeddings then transactionally replace
    const tableNames = Object.keys(ddlMap);
    const ddlTexts = Object.values(ddlMap);

    const embeddings = await generateEmbeddings(ddlTexts);

    // Transactional replacement: delete old + insert new
    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM db_ddl WHERE tenant_id = $1 AND database_id = $2`,
        [auth.tenantId, id]
      );

      for (let i = 0; i < tableNames.length; i++) {
        const embeddingStr = `[${embeddings[i].join(",")}]`;
        await client.query(
          `INSERT INTO db_ddl (tenant_id, database_id, ddl, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [auth.tenantId, id, ddlTexts[i], embeddingStr]
        );
      }
    });

    return jsonResponse({
      ddl: ddlMap,
      table_count: tableNames.length,
      saved: true,
    });
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Schema introspection failed" },
      500
    );
  } finally {
    await tenantConn?.close();
  }
}
