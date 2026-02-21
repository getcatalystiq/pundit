import type { TenantConnection } from "@/lib/tenant-db";

/**
 * Introspect a PostgreSQL database and return CREATE TABLE DDL statements.
 */
export async function introspectSchema(
  connection: TenantConnection,
  schema: string = "public",
  tables?: string[]
): Promise<Record<string, string>> {
  // Get table list
  let tableNames: string[];
  if (tables && tables.length > 0) {
    tableNames = tables;
  } else {
    const result = await connection.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema]
    );
    tableNames = result.rows.map((r) => r.table_name as string);
  }

  const ddlMap: Record<string, string> = {};

  for (const tableName of tableNames) {
    const ddl = await generateTableDdl(connection, schema, tableName);
    ddlMap[tableName] = ddl;
  }

  return ddlMap;
}

async function generateTableDdl(
  connection: TenantConnection,
  schema: string,
  tableName: string
): Promise<string> {
  // Get columns
  const columnsResult = await connection.query(
    `SELECT column_name, data_type, character_maximum_length,
            numeric_precision, numeric_scale, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, tableName]
  );

  // Get primary key
  const pkResult = await connection.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = $1 AND tc.table_name = $2
     ORDER BY kcu.ordinal_position`,
    [schema, tableName]
  );

  // Get foreign keys
  const fkResult = await connection.query(
    `SELECT
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1 AND tc.table_name = $2`,
    [schema, tableName]
  );

  const pkColumns = new Set(
    pkResult.rows.map((r) => r.column_name as string)
  );
  const fkMap = new Map(
    fkResult.rows.map((r) => [
      r.column_name as string,
      `${r.foreign_table_name}(${r.foreign_column_name})`,
    ])
  );

  // Build DDL
  const lines: string[] = [`CREATE TABLE ${tableName} (`];

  for (const col of columnsResult.rows) {
    const name = col.column_name as string;
    let dataType = (col.data_type as string).toUpperCase();

    // Add length/precision
    if (col.character_maximum_length) {
      dataType += `(${col.character_maximum_length})`;
    } else if (
      col.numeric_precision &&
      col.data_type !== "integer" &&
      col.data_type !== "bigint" &&
      col.data_type !== "smallint"
    ) {
      dataType += `(${col.numeric_precision}${col.numeric_scale ? `, ${col.numeric_scale}` : ""})`;
    }

    const parts = [`    ${name} ${dataType}`];

    if (pkColumns.has(name)) parts.push("PRIMARY KEY");
    if (col.is_nullable === "NO" && !pkColumns.has(name))
      parts.push("NOT NULL");
    if (col.column_default && !String(col.column_default).includes("nextval"))
      parts.push(`DEFAULT ${col.column_default}`);
    if (fkMap.has(name)) parts.push(`REFERENCES ${fkMap.get(name)}`);

    lines.push(parts.join(" ") + ",");
  }

  // Remove trailing comma from last column
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
  lines.push(");");

  return lines.join("\n");
}
