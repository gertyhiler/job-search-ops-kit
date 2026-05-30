import path from "node:path";
import { z } from "zod";
import { findRepoRoot } from "./paths.ts";

const envSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
  DATA_DIR: z.string().default("data"),
  DATABASE_PATH: z.string().default("data/db/job-search.sqlite"),
  POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(900),
  FAST_MODEL: z.string().default("cursor.composer_2_5_fast"),
  DRAFT_MODEL: z.string().default("codex.gpt_5_2"),
  REASONING_MODEL: z.string().default("codex.gpt_5_2"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(1),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
  HH_USER_AGENT: z.string().default("job-search-ops-kit/0.1"),
  HH_CLIENT_ID: z.string().default(""),
  HH_CLIENT_SECRET: z.string().default(""),
  HH_OAUTH_TOKEN: z.string().default(""),
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
