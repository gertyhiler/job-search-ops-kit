// Runs when an agent session stops (Cursor + Codex). Captures the session payload
// to the memory inbox, records a programmatic event, and — if enough new events have
// accumulated — spawns the deterministic consolidation in the background (detached),
// so the interactive agent never has to think about it. Fails open.
import { spawn } from "node:child_process";
import path from "node:path";
import {
  ensureDir,
  loadEnv,
  resolvePaths,
  writeTextFile,
} from "@job-search/core";
import { openAndMigrate } from "@job-search/db";
import { recordEvent, shouldConsolidate } from "@job-search/memory";

async function readStdin(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

try {
  const raw = await readStdin();
  const env = loadEnv();
  const p = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
  ensureDir(p.inboxDir);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (raw.trim().length > 0) {
    writeTextFile(path.join(p.inboxDir, `session-stop-${stamp}.json`), raw);
  }

  const db = openAndMigrate(p.dbPath);
  recordEvent(db, {
    type: "session_stopped",
    entityType: "session",
    payload: { bytes: raw.length },
  });
  const due = shouldConsolidate(db, env.CONSOLIDATION_EVENT_THRESHOLD);
  db.close();

  if (due) {
    const child = spawn(
      "node_modules/.bin/tsx",
      ["apps/cli/bin.ts", "consolidate"],
      {
        cwd: p.repoRoot,
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
  }
} catch (error) {
  process.stderr.write(
    `stop hook warning: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}
process.exit(0);
