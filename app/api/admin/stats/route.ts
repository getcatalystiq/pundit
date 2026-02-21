import { requireAdmin, isErrorResponse } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isErrorResponse(auth)) return auth;

  const [dbCount, userCount, queryCount, recentQueries] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM tenant_databases WHERE tenant_id = ${auth.tenantId}::uuid`,
    sql`SELECT COUNT(*) as count FROM users WHERE tenant_id = ${auth.tenantId}::uuid`,
    sql`SELECT COUNT(*) as count FROM query_audit_log WHERE tenant_id = ${auth.tenantId}::uuid`,
    sql`
      SELECT q.sql_text, q.success, q.created_at,
             d.name as database_name
      FROM query_audit_log q
      LEFT JOIN tenant_databases d ON d.id = q.database_id
      WHERE q.tenant_id = ${auth.tenantId}::uuid
      ORDER BY q.created_at DESC
      LIMIT 10
    `,
  ]);

  return jsonResponse({
    database_count: Number(dbCount[0].count),
    user_count: Number(userCount[0].count),
    total_queries: Number(queryCount[0].count),
    recent_queries: recentQueries,
  });
}
