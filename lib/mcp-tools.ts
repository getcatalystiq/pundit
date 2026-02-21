import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extra = RequestHandlerExtra<any, any>;

export const SERVER_INSTRUCTIONS = `You are Pundit, an AI-powered database querying assistant. You help users explore and query their databases using natural language.

WORKFLOW:
1. ALWAYS call search_database_context FIRST to understand the schema and available context
2. Use generate_sql to create SQL queries from natural language questions
3. Use execute_sql to run the generated queries
4. Use visualize_data if the user wants charts or visualizations
5. Use save_sql_pattern to save successful query patterns for future reference
6. Use save_business_context to store domain knowledge the user shares

RULES:
- Always search context before generating SQL
- Only execute SELECT queries (no INSERT, UPDATE, DELETE, etc.)
- Save successful patterns to improve future queries
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
    async (_input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      getAuth(extra);

      // TODO: Implement in Phase 5/6
      return {
        content: [
          {
            type: "text" as const,
            text: "search_database_context: Not yet implemented",
          },
        ],
      };
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
    async (_input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      getAuth(extra);

      return {
        content: [
          {
            type: "text" as const,
            text: "generate_sql: Not yet implemented",
          },
        ],
      };
    }
  );

  // --- execute_sql ---
  server.registerTool(
    "execute_sql",
    {
      title: "Execute SQL",
      description:
        "Execute a SQL query on a tenant database. Only SELECT queries are allowed.",
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
    async (_input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      getAuth(extra);

      return {
        content: [
          {
            type: "text" as const,
            text: "execute_sql: Not yet implemented",
          },
        ],
      };
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
    async (_input, extra) => {
      if (!checkScope(extra, "read")) return scopeError("read");
      getAuth(extra);

      return {
        content: [
          {
            type: "text" as const,
            text: "visualize_data: Not yet implemented",
          },
        ],
      };
    }
  );

  // --- save_sql_pattern ---
  server.registerTool(
    "save_sql_pattern",
    {
      title: "Save SQL Pattern",
      description:
        "Save a successful question/SQL pair as a training example for future queries.",
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
    async (_input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      getAuth(extra);

      return {
        content: [
          {
            type: "text" as const,
            text: "save_sql_pattern: Not yet implemented",
          },
        ],
      };
    }
  );

  // --- save_business_context ---
  server.registerTool(
    "save_business_context",
    {
      title: "Save Business Context",
      description:
        "Save domain knowledge or business context to improve future query generation.",
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
    async (_input, extra) => {
      if (!checkScope(extra, "write")) return scopeError("write");
      getAuth(extra);

      return {
        content: [
          {
            type: "text" as const,
            text: "save_business_context: Not yet implemented",
          },
        ],
      };
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

      // This one we can implement now since it's just a DB query
      const { sql: dbSql } = await import("@/lib/db");
      const rows = await dbSql`
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
