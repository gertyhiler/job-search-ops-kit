// Runs on agent session start (Cursor + Codex). Bootstraps data/DB, loads user-profile
// via the same read_profile MCP tool path, and injects it at the start of context.
// Fails open: never blocks the session.
import path from "node:path";
import {
  ensureDir,
  loadEnv,
  resolvePaths,
  writeJsonFile,
} from "@job-search/core";
import { openAndMigrate } from "@job-search/db";
import { callToolOnce } from "@job-search/mcp";
import {
  buildHookStdout,
  detectHookPlatform,
  extractUserProfile,
  formatUserProfileContext,
} from "./session-start-helpers.ts";

async function readStdin(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

try {
  const rawStdin = await readStdin();
  let hookInput: unknown;
  if (rawStdin.trim()) {
    try {
      hookInput = JSON.parse(rawStdin) as unknown;
    } catch {
      hookInput = undefined;
    }
  }
  const platform = detectHookPlatform(hookInput);

  const env = loadEnv();
  const p = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
  for (const d of [
    p.dataDir,
    path.dirname(p.dbPath),
    p.profileDir,
    p.memoryDir,
    p.journalDir,
    p.inboxDir,
    p.insightsDir,
    p.healthDir,
  ]) {
    ensureDir(d);
  }
  const db = openAndMigrate(p.dbPath);
  db.close();

  const profileResult = await callToolOnce("read_profile", {});
  const userProfile = extractUserProfile(profileResult);
  const additionalContext = formatUserProfileContext(userProfile);
  const stdout = buildHookStdout(platform, additionalContext);
  if (stdout) {
    process.stdout.write(stdout + "\n");
  }

  writeJsonFile(path.join(p.healthDir, "session-start.json"), {
    ts: new Date().toISOString(),
    ok: true,
    autoApplyMode: env.AUTO_APPLY_MODE,
    profileInjected: Boolean(additionalContext),
    hookPlatform: platform,
  });
} catch (error) {
  // fail open
  process.stderr.write(
    `session-start hook warning: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}
process.exit(0);
