// Runs on agent session start (Cursor + Codex). Ensures the data tree + DB exist
// and writes a health marker. Fails open: never blocks the session.
import path from "node:path";
import {
  ensureDir,
  loadEnv,
  resolvePaths,
  readTextFileOr,
  writeJsonFile,
  writeTextFile,
} from "@job-search/core";
import { openAndMigrate } from "@job-search/db";

try {
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

  // Best-effort: provide a small, durable context snippet for the chat agent.
  const userProfile = readTextFileOr(
    path.join(p.profileDir, "user-profile.md"),
    "",
  ).trim();
  if (userProfile) {
    writeTextFile(
      path.join(p.inboxDir, "session-start-user-profile.md"),
      userProfile + "\n",
    );
  }

  writeJsonFile(path.join(p.healthDir, "session-start.json"), {
    ts: new Date().toISOString(),
    ok: true,
    autoApplyMode: env.AUTO_APPLY_MODE,
  });
} catch (error) {
  // fail open
  process.stderr.write(
    `session-start hook warning: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}
process.exit(0);
