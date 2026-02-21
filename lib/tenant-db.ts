import pg from "pg";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

const { Client } = pg;

export type TenantConnection = {
  query: (
    sqlText: string,
    params?: unknown[]
  ) => Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
  close: () => Promise<void>;
};

/**
 * Connect to a tenant's external PostgreSQL database.
 * Decrypts stored credentials, establishes connection, and sets read-only mode.
 */
export async function connectTenantDb(
  tenantId: string,
  databaseName?: string
): Promise<TenantConnection> {
  // Resolve database: by name → default → any enabled
  let dbRow: Record<string, unknown> | null = null;

  if (databaseName) {
    const rows = await sql`
      SELECT * FROM tenant_databases
      WHERE tenant_id = ${tenantId}::uuid AND name = ${databaseName} AND enabled = TRUE
    `;
    dbRow = rows[0] ?? null;
  }

  if (!dbRow) {
    const rows = await sql`
      SELECT * FROM tenant_databases
      WHERE tenant_id = ${tenantId}::uuid AND enabled = TRUE
      ORDER BY is_default DESC
      LIMIT 1
    `;
    dbRow = rows[0] ?? null;
  }

  if (!dbRow) {
    throw new Error(
      databaseName
        ? `Database "${databaseName}" not found or disabled`
        : "No databases configured. Add one via the admin dashboard."
    );
  }

  // Decrypt password with AAD
  const aad = `${tenantId}:${dbRow.id}`;
  const password = decrypt(
    dbRow.encrypted_password as Buffer,
    dbRow.encryption_iv as Buffer,
    dbRow.encryption_tag as Buffer,
    aad
  );

  const client = new Client({
    host: dbRow.host as string,
    port: dbRow.port as number,
    database: dbRow.database_name as string,
    user: dbRow.username as string,
    password,
    ssl:
      (dbRow.ssl_mode as string) === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });

  await client.connect();

  // Set read-only transaction mode for defense-in-depth
  await client.query("SET TRANSACTION READ ONLY");

  return {
    query: async (sqlText: string, params?: unknown[]) => {
      const result = await client.query(sqlText, params);
      const columns = result.fields.map((f) => f.name);
      return { columns, rows: result.rows };
    },
    close: async () => {
      await client.end();
    },
  };
}

/**
 * Test connectivity to an external database.
 */
export async function testConnection(
  host: string,
  port: number,
  database: string,
  username: string,
  password: string,
  sslMode?: string
): Promise<{
  success: boolean;
  version?: string;
  latency_ms?: number;
  error?: string;
}> {
  const start = Date.now();
  const client = new Client({
    host,
    port,
    database,
    user: username,
    password,
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    const result = await client.query("SELECT version()");
    const latency = Date.now() - start;
    return {
      success: true,
      version: result.rows[0]?.version,
      latency_ms: latency,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Get the database record for a tenant, returning the database ID.
 * Used by MCP tools to resolve database name to ID.
 */
export async function resolveDatabaseId(
  tenantId: string,
  databaseName?: string
): Promise<{ databaseId: string; databaseName: string }> {
  let rows;
  if (databaseName) {
    rows = await sql`
      SELECT id, name FROM tenant_databases
      WHERE tenant_id = ${tenantId}::uuid AND name = ${databaseName} AND enabled = TRUE
    `;
  } else {
    rows = await sql`
      SELECT id, name FROM tenant_databases
      WHERE tenant_id = ${tenantId}::uuid AND enabled = TRUE
      ORDER BY is_default DESC
      LIMIT 1
    `;
  }

  if (rows.length === 0) {
    throw new Error(
      databaseName
        ? `Database "${databaseName}" not found`
        : "No databases configured"
    );
  }

  return {
    databaseId: rows[0].id as string,
    databaseName: rows[0].name as string,
  };
}
