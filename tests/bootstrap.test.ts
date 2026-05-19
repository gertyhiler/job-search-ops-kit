import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensureCanonicalConfigTree,
  ensureCanonicalDataTree,
  ensureCanonicalStateTree,
  bootstrapOperatorEnvironment,
  bootstrapUserDataFoundation,
  copyBootstrapDefaults,
  getOperatorWorkflowStatus,
  scaffoldPrivateEnv,
  scaffoldRuntimeSettings
} from "../packages/core/bootstrap.ts";
import { parseJsonishFile } from "../packages/core/json.ts";
import { normalizeScheduleSeed } from "../packages/core/schedules.ts";

async function withTempDir(fn: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-bootstrap-"));
  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("bootstrap tree helpers create config, data, and state roots", async () => {
  await withTempDir(async (tempDir) => {
    const configRoot = path.join(tempDir, "config-root");
    const dataRoot = path.join(tempDir, "data-root");
    const stateRoot = path.join(tempDir, "state-root");

    const createdConfig = await ensureCanonicalConfigTree(configRoot);
    const createdData = await ensureCanonicalDataTree(dataRoot);
    const createdState = await ensureCanonicalStateTree(stateRoot);

    assert.ok(createdConfig.includes("browser-recipes"));
    assert.ok(createdData.includes("memory/profile"));
    assert.ok(createdData.includes("memory/onboarding"));
    assert.ok(createdData.includes("memory/interviews/mock"));
    assert.ok(createdData.includes("memory/session-logs"));
    assert.ok(createdData.includes("inbox/session-transcripts"));
    assert.ok(createdData.includes("inbox"));
    assert.ok(createdState.includes("audit"));

    const stats = await fs.stat(path.join(dataRoot, "memory", "strategy", "change-proposals"));
    assert.ok(stats.isDirectory());
  });
});

test("copyBootstrapDefaults is non-destructive", async () => {
  await withTempDir(async (tempDir) => {
    const configRoot = path.join(tempDir, "config-root");
    const dataRoot = path.join(tempDir, "data-root");
    await ensureCanonicalConfigTree(configRoot);
    await ensureCanonicalDataTree(dataRoot);
    const targetPath = path.join(configRoot, "escalation-rules.yaml");
    await fs.writeFile(targetPath, '{"keep":"me"}\n', "utf8");

    const copied = await copyBootstrapDefaults(configRoot, dataRoot);
    assert.ok(copied.includes("data/memory/resumes/theme-defaults.yaml"));
    assert.ok(copied.includes("data/memory/strategy/active-strategy.yaml"));

    const raw = await fs.readFile(targetPath, "utf8");
    assert.equal(raw, '{"keep":"me"}\n');
  });
});

test("scaffoldRuntimeSettings writes config/runtime-settings once and preserves subsequent runs", async () => {
  await withTempDir(async (tempDir) => {
    await ensureCanonicalConfigTree(tempDir);
    const first = await scaffoldRuntimeSettings(tempDir, { selected_runner_adapter: "cursor-cli" });
    const second = await scaffoldRuntimeSettings(tempDir, { selected_runner_adapter: "codex-cli" });

    assert.equal(first.created, true);
    assert.equal(second.created, false);

    const runtimeSettings = await parseJsonishFile(first.path);
    assert.equal(runtimeSettings.selected_runner_adapter, "cursor-cli");
  });
});

test("bootstrapUserDataFoundation composes config/data/state creation, defaults, env, and runtime settings", async () => {
  await withTempDir(async (tempDir) => {
    const previousConfig = process.env.JOB_SEARCH_CONFIG_DIR;
    const previousState = process.env.JOB_SEARCH_STATE_DIR;
    process.env.JOB_SEARCH_CONFIG_DIR = path.join(tempDir, "config-root");
    process.env.JOB_SEARCH_STATE_DIR = path.join(tempDir, "state-root");

    const result = await bootstrapUserDataFoundation(path.join(tempDir, "data-root"));
    assert.equal(result.dataRoot, path.join(tempDir, "data-root"));
    assert.equal(result.configRoot, path.join(tempDir, "config-root"));
    assert.equal(result.stateRoot, path.join(tempDir, "state-root"));
    assert.ok(result.createdDataDirectories.length > 0);
    assert.ok(result.createdConfigDirectories.includes("browser-recipes"));
    assert.ok(result.createdStateDirectories.includes("browser-profiles"));
    assert.ok(result.createdStateDirectories.includes("control-plane"));
    assert.ok(result.copiedDefaults.includes("config/escalation-rules.yaml"));
    assert.ok(result.copiedDefaults.includes("data/memory/strategy/active-strategy.yaml"));
    assert.equal(result.runtimeSettingsCreated, true);
    assert.equal(result.envFileCreated, true);

    process.env.JOB_SEARCH_CONFIG_DIR = previousConfig;
    process.env.JOB_SEARCH_STATE_DIR = previousState;
  });
});

test("getOperatorWorkflowStatus reports onboarding readiness from runtime roots", async () => {
  await withTempDir(async (tempDir) => {
    const configRoot = path.join(tempDir, "config-root");
    const dataRoot = path.join(tempDir, "data-root");
    const stateRoot = path.join(tempDir, "state-root");
    await bootstrapOperatorEnvironment({
      configRoot,
      dataRoot,
      stateRoot
    });

    const emptyStatus = await getOperatorWorkflowStatus({
      appRoot: tempDir,
      configRoot,
      dataRoot,
      stateRoot
    });
    assert.equal(emptyStatus.onboarding.ready, false);
    assert.ok(emptyStatus.onboarding.missing.includes("profile snapshot"));
    assert.ok(emptyStatus.onboarding.missing.includes("master resume"));

    await fs.writeFile(path.join(dataRoot, "memory", "profile", "profile.snapshot.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(dataRoot, "memory", "profile", "master-resume.md"), "# Resume\n", "utf8");

    const readyStatus = await getOperatorWorkflowStatus({
      appRoot: tempDir,
      configRoot,
      dataRoot,
      stateRoot
    });
    assert.equal(readyStatus.onboarding.ready, true);
  });
});

test("scaffoldPrivateEnv creates ~/.config-like env file once", async () => {
  await withTempDir(async (tempDir) => {
    await ensureCanonicalConfigTree(tempDir);
    const first = await scaffoldPrivateEnv(tempDir);
    const second = await scaffoldPrivateEnv(tempDir);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    const raw = await fs.readFile(first.path, "utf8");
    assert.ok(raw.includes("HH_CLIENT_ID=replace-me"));
  });
});

test("normalizeScheduleSeed derives runtime-only state from the public seed", () => {
  const schedule = normalizeScheduleSeed({
    id: "nightly-memory",
    cron: "0 23 * * *",
    role: "memory-manager",
    model: "gpt-5.4-nano",
    reasoning_effort: "low",
    prompt_file: "prompts/roles/memory-manager.md",
    dry_run: true,
    enabled: true,
    catchup_policy: "run_once_if_overdue"
  }, new Date("2026-04-23T12:34:56Z"));

  assert.equal(schedule.fails_in_a_row, 0);
  assert.equal(schedule.last_run_at, null);
  assert.equal(schedule.last_status, null);
  assert.ok(Date.parse(schedule.next_run_at) > Date.parse("2026-04-23T12:34:56Z"));
});
