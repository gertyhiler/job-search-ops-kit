#!/usr/bin/env -S node --experimental-strip-types
import fs from "node:fs/promises";
import path from "node:path";
import {
  bootstrapOperatorEnvironment,
  ensureDirectory,
  getOperatorWorkflowStatus
} from "../../packages/core/index.ts";
import { migrateDatabase, replayDatabase } from "../../packages/db/index.ts";

const bootstrap = await bootstrapOperatorEnvironment();
await migrateDatabase({
  dataRoot: bootstrap.dataRoot,
  stateRoot: bootstrap.stateRoot
});
await replayDatabase({
  dataRoot: bootstrap.dataRoot,
  stateRoot: bootstrap.stateRoot
});

const status = await getOperatorWorkflowStatus({
  dataRoot: bootstrap.dataRoot,
  stateRoot: bootstrap.stateRoot
});
const healthPath = path.join(bootstrap.stateRoot, "health", "codex-session-start.json");
await ensureDirectory(path.dirname(healthPath));
await fs.writeFile(healthPath, JSON.stringify({
  ts: new Date().toISOString(),
  onboarding_ready: status.onboarding.ready,
  onboarding_missing: status.onboarding.missing,
  checks: status.checks
}, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  onboarding_ready: status.onboarding.ready,
  onboarding_missing: status.onboarding.missing,
  health_path: healthPath
}));
