import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const migrationsDir = join(__dirname, "..", "migrations");
  const migrationFile = join(migrationsDir, "001_schema.sql");
  const sqlContent = readFileSync(migrationFile, "utf-8");

  console.log("Running migration: 001_schema.sql");

  try {
    await pool.query(sqlContent);
    console.log("Migration complete!");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("already exists")) {
      console.log("Tables already exist, migration skipped.");
    } else {
      console.error("Migration failed:", msg);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
