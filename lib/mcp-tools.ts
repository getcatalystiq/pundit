import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { sql } from "@/lib/db";
import { searchTrainingData, saveToolMemory, saveTextMemory, toPromptSections } from "@/lib/rag";
import { resolveDatabaseId, connectTenantDb } from "@/lib/tenant-db";
import { generateSql } from "@/lib/sql-generator";
import { renderChart } from "@/lib/chart";
import { setLastQueryResult, getLastQueryResult } from "@/lib/request-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extra = RequestHandlerExtra<any, any>;

export const SERVER_INSTRUCTIONS = `You are Pundit, an AI-powered database querying assistant. You help users explore and query their databases using natural language.

MANDATORY WORKFLOW — you MUST follow these steps in order for every query:
1. Call search_database_context FIRST to retrieve the database schema, documentation, and examples
2. Call generate_sql to create the SQL query — NEVER write SQL yourself, always use this tool
3. Call execute_sql with the SQL returned by generate_sql
4. Optionally call visualize_data if the user wants charts
5. ALWAYS call save_sql_pattern after a successful query — this is MANDATORY, not optional

LEARNING RULES — you MUST follow these:
- After EVERY successful query, call save_sql_pattern with the question and SQL. NEVER skip this step.
- When the user shares business knowledge, domain terminology, column meanings, or data conventions, call save_business_context to store it. Examples: "revenue means column X", "active users are those with status='active'", "Q1 is Jan-Mar".
- Proactively ask clarifying questions about business context, then save the answers with save_business_context.

CRITICAL RULES:
- NEVER skip steps 1-3. NEVER write SQL directly — always use generate_sql
- NEVER call execute_sql without first calling search_database_context and generate_sql
- NEVER skip step 5 after a successful query
- Only execute SELECT queries (no INSERT, UPDATE, DELETE, etc.)
- When showing results, format them clearly for the user`;

function checkScope(extra: Extra, requiredScope: string): boolean {
  const scopes = (extra.authInfo as Record<string, unknown> | undefined)
    ?.scopes;
  return Array.isArray(scopes) && scopes.includes(requiredScope);
}

function getAuth(extra: Extra) {
  const authExtra = (
    extra.authInfo as Record<string, unknown> | undefined
  )?.extra as { userId: string; tenantId: string } | undefined;
  const userId = authExtra?.userId;
  const tenantId = authExtra?.tenantId;
  if (!userId || !tenantId) {
    throw new Error("Authentication required");
  }
  return { userId, tenantId };
}

function scopeError(scope: string) {
  return {
    content: [
      { type: "text" as const, text: `Error: '${scope}' scope required` },
    ],
    isError: true,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// SQL safety: only allow SELECT, WITH...SELECT, EXPLAIN SELECT
const BLOCKED_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|CALL|EXECUTE|EXEC)\b/i;

function isSelectOnly(sqlText: string): boolean {
  const trimmed = sqlText.trim();
  if (BLOCKED_KEYWORDS.test(trimmed)) return false;
  // Allow SELECT, WITH...SELECT, EXPLAIN SELECT
  return /^\s*(SELECT|WITH\s|EXPLAIN\s)/i.test(trimmed);
}

function injectLimit(sqlText: string, maxRows: number): string {
  // Don't add LIMIT if one already exists
  if (/\bLIMIT\s+\d+/i.test(sqlText)) return sqlText;
  return `${sqlText.replace(/;\s*$/, "")} LIMIT ${maxRows}`;
}

export function registerTools(server: McpServer) {
  // --- search_database_context ---
  server.registerTool(
    "search_database_context",
    {
      title: "Search Database Context",
      description:
        "Search training data (DDL, documentation, examples, memories) for relevant context about the database. ALWAYS call this first before generating SQL.",
      inputSchema: {
        question: z
          .string()
          .describe("Natural language question to search for"),
        database: z
          .string()
          .optional()
          .describe("Database name (uses default if omitted)"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      const { tenantId } = getAuth(extra);

      try {
        const { databaseId, databaseName } = await resolveDatabaseId(
          tenantId,
          input.database
        );
        const context = await searchTrainingData(
          input.question,
          tenantId,
          databaseId
        );
        const sections = toPromptSections(context);

        const summary = [
          `Database: **${databaseName}**`,
          `Found: ${context.ddl.length} DDL, ${context.documentation.length} docs, ${context.examples.length} examples, ${context.toolMemory.length} tool memories, ${context.textMemory.length} text memories`,
          "",
          sections || "No relevant training data found.",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Search failed"
        );
      }
    }
  );

  // --- generate_sql ---
  server.registerTool(
    "generate_sql",
    {
      title: "Generate SQL",
      description:
        "Generate a SQL query from a natural language question using the database context.",
      inputSchema: {
        question: z.string().describe("Natural language question"),
        database: z
          .string()
          .optional()
          .describe("Database name (uses default if omitted)"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      const { tenantId } = getAuth(extra);

      try {
        const { databaseId } = await resolveDatabaseId(
          tenantId,
          input.database
        );
        const context = await searchTrainingData(
          input.question,
          tenantId,
          databaseId
        );
        const result = await generateSql(input.question, context);

        return {
          content: [
            {
              type: "text" as const,
              text: `**Explanation:** ${result.explanation}\n\n\`\`\`sql\n${result.sql}\n\`\`\``,
            },
          ],
        };
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "SQL generation failed"
        );
      }
    }
  );

  // --- execute_sql ---
  server.registerTool(
    "execute_sql",
    {
      title: "Execute SQL",
      description:
        "Execute a SQL query on a tenant database. Only SELECT queries are allowed. IMPORTANT: Do NOT write SQL yourself. First call search_database_context to understand the schema, then call generate_sql to produce the query, then pass that SQL here.",
      inputSchema: {
        sql: z.string().describe("SQL query to execute (SELECT only)"),
        database: z
          .string()
          .optional()
          .describe("Database name (uses default if omitted)"),
        max_rows: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .default(100)
          .describe("Maximum rows to return"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      const { userId, tenantId } = getAuth(extra);

      // Validate SQL safety
      if (!isSelectOnly(input.sql)) {
        return errorResult(
          "Only SELECT queries are allowed. Use SELECT, WITH...SELECT, or EXPLAIN SELECT."
        );
      }

      const finalSql = injectLimit(input.sql, input.max_rows);
      const start = Date.now();

      let conn;
      try {
        const { databaseId, databaseName } = await resolveDatabaseId(
          tenantId,
          input.database
        );
        conn = await connectTenantDb(tenantId, input.database);
        const { columns, rows } = await conn.query(finalSql);
        const executionTime = Date.now() - start;

        // Store in AsyncLocalStorage for visualize_data
        setLastQueryResult(columns, rows);

        // Log to audit table
        await sql`
          INSERT INTO query_audit_log (tenant_id, database_id, user_id, sql_text, row_count, execution_time_ms, success)
          VALUES (${tenantId}::uuid, ${databaseId}::uuid, ${userId}::uuid, ${input.sql}, ${rows.length}, ${executionTime}, TRUE)
        `;

        // Format results as markdown table
        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Query returned 0 rows from **${databaseName}** (${executionTime}ms)`,
              },
            ],
          };
        }

        const header = `| ${columns.join(" | ")} |`;
        const separator = `| ${columns.map(() => "---").join(" | ")} |`;
        const dataRows = rows.map(
          (row) =>
            `| ${columns.map((c) => String(row[c] ?? "NULL")).join(" | ")} |`
        );

        const table = [header, separator, ...dataRows].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `**${databaseName}** — ${rows.length} rows (${executionTime}ms)\n\n${table}`,
            },
          ],
        };
      } catch (e) {
        const executionTime = Date.now() - start;
        const errorMsg =
          e instanceof Error ? e.message : "Query execution failed";

        // Log failed query
        try {
          const { databaseId } = await resolveDatabaseId(
            tenantId,
            input.database
          );
          await sql`
            INSERT INTO query_audit_log (tenant_id, database_id, user_id, sql_text, execution_time_ms, success, error_message)
            VALUES (${tenantId}::uuid, ${databaseId}::uuid, ${userId}::uuid, ${input.sql}, ${executionTime}, FALSE, ${errorMsg})
          `;
        } catch {
          // Don't fail the response if audit logging fails
        }

        return errorResult(errorMsg);
      } finally {
        await conn?.close();
      }
    }
  );

  // --- visualize_data ---
  server.registerTool(
    "visualize_data",
    {
      title: "Visualize Data",
      description:
        "Generate a chart visualization from the most recent query results.",
      inputSchema: {
        chart_type: z
          .enum(["bar", "line", "scatter", "pie", "doughnut"])
          .describe("Type of chart to generate"),
        x_column: z.string().describe("Column name for the X axis"),
        y_column: z.string().describe("Column name for the Y axis"),
        title: z.string().optional().describe("Chart title"),
        color_column: z
          .string()
          .optional()
          .describe("Column to use for color grouping"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      getAuth(extra);

      const lastResult = getLastQueryResult();
      if (!lastResult || lastResult.rows.length === 0) {
        return errorResult(
          "No query results available. Run execute_sql first."
        );
      }

      // Validate columns exist
      if (!lastResult.columns.includes(input.x_column)) {
        return errorResult(
          `Column '${input.x_column}' not found. Available: ${lastResult.columns.join(", ")}`
        );
      }
      if (!lastResult.columns.includes(input.y_column)) {
        return errorResult(
          `Column '${input.y_column}' not found. Available: ${lastResult.columns.join(", ")}`
        );
      }

      try {
        const png = await renderChart(
          input.chart_type,
          input.x_column,
          input.y_column,
          lastResult.rows,
          {
            title: input.title,
            colorColumn: input.color_column,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Chart rendered: ${input.chart_type} (${input.x_column} vs ${input.y_column})`,
            },
            {
              type: "image" as const,
              data: png.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Chart rendering failed"
        );
      }
    }
  );

  // --- save_sql_pattern ---
  server.registerTool(
    "save_sql_pattern",
    {
      title: "Save SQL Pattern",
      description:
        "MANDATORY: Call this after EVERY successful execute_sql query. Saves the question/SQL pair so future queries improve over time. Never skip this step.",
      inputSchema: {
        question: z
          .string()
          .describe("The natural language question"),
        sql: z.string().describe("The SQL query that answered it"),
        database: z
          .string()
          .optional()
          .describe("Database name (uses default if omitted)"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      const { tenantId } = getAuth(extra);

      try {
        const { databaseId, databaseName } = await resolveDatabaseId(
          tenantId,
          input.database
        );

        const savedId = await saveToolMemory(
          input.question,
          "generate_sql",
          { question: input.question, sql: input.sql },
          true,
          null,
          tenantId,
          databaseId
        );

        if (savedId) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Pattern saved to **${databaseName}** for future reference.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `A similar pattern already exists in **${databaseName}**. Skipped to avoid duplicates.`,
            },
          ],
        };
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Save failed"
        );
      }
    }
  );

  // --- save_business_context ---
  server.registerTool(
    "save_business_context",
    {
      title: "Save Business Context",
      description:
        "Save domain knowledge or business context to improve future query generation. Call this whenever the user shares business terminology, column meanings, data conventions, or domain-specific rules. Examples: 'revenue = amount column', 'active users have status=active', 'fiscal year starts in April'.",
      inputSchema: {
        content: z
          .string()
          .describe("Business context or domain knowledge to save"),
        database: z
          .string()
          .optional()
          .describe("Database name (uses default if omitted)"),
      },
    },
    async (input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      const { tenantId } = getAuth(extra);

      try {
        const { databaseId, databaseName } = await resolveDatabaseId(
          tenantId,
          input.database
        );

        const savedId = await saveTextMemory(
          input.content,
          tenantId,
          databaseId
        );

        if (savedId) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Business context saved to **${databaseName}**.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Similar business context already exists in **${databaseName}**. Skipped to avoid duplicates.`,
            },
          ],
        };
      } catch (e) {
        return errorResult(
          e instanceof Error ? e.message : "Save failed"
        );
      }
    }
  );

  // --- list_databases ---
  server.registerTool(
    "list_databases",
    {
      title: "List Databases",
      description: "List all databases connected to your tenant.",
      inputSchema: {},
    },
    async (_input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      const { tenantId } = getAuth(extra);

      const rows = await sql`
        SELECT name, database_name, host, port, is_default, enabled
        FROM tenant_databases
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY is_default DESC, name ASC
      `;

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No databases connected. Ask your admin to add one via the dashboard.",
            },
          ],
        };
      }

      const lines = rows.map((r) => {
        const def = r.is_default ? " (default)" : "";
        const status = r.enabled ? "enabled" : "disabled";
        return `- **${r.name}**${def}: ${r.host}:${r.port}/${r.database_name} [${status}]`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Connected databases:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );
}
