import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  BLOB_READ_WRITE_TOKEN: z.string().min(1, "BLOB_READ_WRITE_TOKEN is required"),
  NEXT_PUBLIC_URL: z.string().url("NEXT_PUBLIC_URL must be a valid URL"),
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be exactly 64 hex characters")
    .regex(/^[0-9a-fA-F]+$/, "ENCRYPTION_KEY must be hexadecimal"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ENVIRONMENT: z.enum(["dev", "prod"]).default("dev"),
  CRON_SECRET: z.string().optional(),
  ALLOWED_DCR_DOMAINS: z
    .string()
    .default("claude.ai,localhost,127.0.0.1")
    .transform((s) => s.split(",").map((d) => d.trim())),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Lazily validated environment — crashes on first access if invalid.
 * Lazy to avoid crashing during Next.js build (no env vars at build time).
 */
export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Environment validation failed:\n${errors}`);
    }
    _env = result.data;
  }
  return _env;
}
