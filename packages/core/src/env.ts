import path from "node:path";
import { z } from "zod";
import { findRepoRoot } from "./paths.ts";

const envSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
  DATA_DIR: z.string().default("data"),
  DATABASE_PATH: z.string().default("data/db/job-search.sqlite"),
  POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(900),
  FAST_MODEL: z.string().default("cursor.composer-2.5-fast"),
  DRAFT_MODEL: z.string().default("codex.gpt-5.2"),
  REASONING_MODEL: z.string().default("codex.gpt-5.2"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(1),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
  /** Long-poll for inline buttons (/status, approve). Off = outbound notify only. */
  TELEGRAM_POLLING: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Playwright context defaults. Empty USER_AGENT = Desktop Chrome at runtime. */
  PLAYWRIGHT_USER_AGENT: z.string().default(""),
  PLAYWRIGHT_LOCALE: z.string().default("en-US"),
  PLAYWRIGHT_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1280),
  PLAYWRIGHT_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(720),
  /** HH flows (search / apply / hh:login). Independent from PLAYWRIGHT_*. */
  HH_PLAYWRIGHT_USER_AGENT: z.string().default(""),
  HH_PLAYWRIGHT_LOCALE: z.string().default("ru-RU"),
  HH_PLAYWRIGHT_VIEWPORT_WIDTH: z.coerce
    .number()
    .int()
    .positive()
    .default(1280),
  HH_PLAYWRIGHT_VIEWPORT_HEIGHT: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  AUTO_APPLY_MODE: z.enum(["dry_run", "real"]).default("dry_run"),
  TYPST_BIN: z.string().default("typst"),
  CONSOLIDATION_EVENT_THRESHOLD: z.coerce.number().int().positive().default(25),
});

export type Env = z.infer<typeof envSchema>;

let loaded = false;

/** Load `.env` from the repo root once (no-op if missing), then parse process.env. */
export function loadEnv(): Env {
  if (!loaded) {
    loaded = true;
    const envPath = path.join(findRepoRoot(), ".env");
    try {
      // Node >= 20.12
      (
        process as unknown as { loadEnvFile?: (p: string) => void }
      ).loadEnvFile?.(envPath);
    } catch {
      // .env absent or unreadable -> rely on existing process.env
    }
  }
  return envSchema.parse(process.env);
}
