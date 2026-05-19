#!/usr/bin/env -S node --experimental-strip-types
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirectory, getDataRoot } from "../../packages/core/index.ts";

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const payload = await new Promise<string>((resolve, reject) => {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => resolve(raw));
  process.stdin.on("error", reject);
});

const transcriptRoot = path.join(getDataRoot(), "inbox", "session-transcripts");
await ensureDirectory(transcriptRoot);
const transcriptPath = path.join(transcriptRoot, `codex-stop-${safeTimestamp()}.json`);
await fs.writeFile(transcriptPath, payload.trim() ? payload : "{}\n", "utf8");

process.stdout.write(JSON.stringify({
  ok: true,
  transcript_path: transcriptPath
}));
process.stdout.write("\n");
