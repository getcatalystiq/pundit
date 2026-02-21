import { AsyncLocalStorage } from "node:async_hooks";

export type ToolContext = {
  lastQueryResult?: {
    columns: string[];
    rows: Record<string, unknown>[];
  };
};

export const toolContextStorage = new AsyncLocalStorage<ToolContext>();

export function getToolContext(): ToolContext {
  const ctx = toolContextStorage.getStore();
  if (!ctx) {
    throw new Error("Tool context not initialized — wrap handler in toolContextStorage.run()");
  }
  return ctx;
}

export function setLastQueryResult(
  columns: string[],
  rows: Record<string, unknown>[]
): void {
  const ctx = getToolContext();
  ctx.lastQueryResult = { columns, rows };
}

export function getLastQueryResult(): {
  columns: string[];
  rows: Record<string, unknown>[];
} | null {
  const ctx = toolContextStorage.getStore();
  return ctx?.lastQueryResult ?? null;
}
