import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildOperatorBundle, installOperatorBundle } from "../scripts/lib/operator-runtime.ts";
import { JobSearchService } from "../packages/mcp-server/service.ts";
import {
  getControlPlaneRun,
  getDashboardSnapshot,
  listControlPlaneRuns,
  startSupervisedRuntimeRun
} from "../packages/runtime/control-plane.ts";

async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const sourceEntry = path.join(sourcePath, entry.name);
    const targetEntry = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourceEntry, targetEntry);
      return;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourceEntry, targetEntry);
    }
  }));
}

async function execNode(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 15000): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (value != null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

async function withInstalledOperator(fn: (ctx: {
  appRoot: string;
  configRoot: string;
  dataRoot: string;
  stateRoot: string;
  env: NodeJS.ProcessEnv;
}) => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-control-plane-"));
  try {
    const bundleRoot = path.join(tempRoot, "bundle");
    await buildOperatorBundle({ outputRoot: bundleRoot });

    const installResult = await installOperatorBundle({
      bundleRoot,
      appRoot: path.join(tempRoot, "app"),
      binRoot: path.join(tempRoot, "bin"),
      cacheRoot: path.join(tempRoot, "cache"),
      configRoot: path.join(tempRoot, "config"),
      dataRoot: path.join(tempRoot, "data"),
      stateRoot: path.join(tempRoot, "state")
    });

    await copyDirectory(path.join(process.cwd(), "examples", "user-data-example"), installResult.dataRoot);

    const env = {
      ...process.env,
      JOB_SEARCH_APP_ROOT: installResult.appRoot,
      JOB_SEARCH_CONFIG_DIR: installResult.configRoot,
      JOB_SEARCH_DATA_DIR: installResult.dataRoot,
      JOB_SEARCH_STATE_DIR: installResult.stateRoot,
      JOB_SEARCH_CACHE_DIR: path.join(tempRoot, "cache")
    };

    const replay = await execNode([
      "--experimental-strip-types",
      path.join(installResult.appRoot, "packages", "cli", "bin.ts"),
      "db",
      "replay"
    ], env);
    assert.equal(replay.code, 0, replay.stderr);

    const previousEnv = {
      JOB_SEARCH_APP_ROOT: process.env.JOB_SEARCH_APP_ROOT,
      JOB_SEARCH_CONFIG_DIR: process.env.JOB_SEARCH_CONFIG_DIR,
      JOB_SEARCH_DATA_DIR: process.env.JOB_SEARCH_DATA_DIR,
      JOB_SEARCH_STATE_DIR: process.env.JOB_SEARCH_STATE_DIR,
      JOB_SEARCH_CACHE_DIR: process.env.JOB_SEARCH_CACHE_DIR
    };

    process.env.JOB_SEARCH_APP_ROOT = installResult.appRoot;
    process.env.JOB_SEARCH_CONFIG_DIR = installResult.configRoot;
    process.env.JOB_SEARCH_DATA_DIR = installResult.dataRoot;
    process.env.JOB_SEARCH_STATE_DIR = installResult.stateRoot;
    process.env.JOB_SEARCH_CACHE_DIR = path.join(tempRoot, "cache");

    try {
      await fn({
        appRoot: installResult.appRoot,
        configRoot: installResult.configRoot,
        dataRoot: installResult.dataRoot,
        stateRoot: installResult.stateRoot,
        env
      });
    } finally {
      process.env.JOB_SEARCH_APP_ROOT = previousEnv.JOB_SEARCH_APP_ROOT;
      process.env.JOB_SEARCH_CONFIG_DIR = previousEnv.JOB_SEARCH_CONFIG_DIR;
      process.env.JOB_SEARCH_DATA_DIR = previousEnv.JOB_SEARCH_DATA_DIR;
      process.env.JOB_SEARCH_STATE_DIR = previousEnv.JOB_SEARCH_STATE_DIR;
      process.env.JOB_SEARCH_CACHE_DIR = previousEnv.JOB_SEARCH_CACHE_DIR;
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForHttp(baseUrl: string): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/dashboard`);
      return response.ok ? true : null;
    } catch {
      return null;
    }
  }, 20000);
}

async function withRunningControlPlane(
  ctx: {
    appRoot: string;
    env: NodeJS.ProcessEnv;
  },
  fn: (state: { baseUrl: string }) => Promise<void>
): Promise<void> {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    path.join(ctx.appRoot, "packages", "cli", "bin.ts"),
    "app",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port)
  ], {
    env: ctx.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHttp(baseUrl);
    await fn({ baseUrl });
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.on("exit", resolve));
    void stderr;
  }
}

function isListenPermissionError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: string }).code === "EPERM"
  );
}

async function waitForControlPlaneRunFinished(runId: string): Promise<any> {
  return waitFor(async () => {
    const run = await getControlPlaneRun(runId);
    return run?.finished_at ? run : null;
  }, 15000);
}

async function waitForApiRunFinished(baseUrl: string, runId: string): Promise<any> {
  return waitFor(async () => {
    const response = await fetch(`${baseUrl}/api/runs/${runId}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as { run?: any };
    return payload.run?.finished_at ? payload.run : null;
  }, 15000);
}

test("dashboard snapshot and control-plane readers expose installed runtime state", async () => {
  await withInstalledOperator(async ({ dataRoot, stateRoot }) => {
    const dashboard = await getDashboardSnapshot({ dataRoot, stateRoot });
    const runs = await listControlPlaneRuns({ stateRoot });

    assert.equal(((dashboard.next_actions as any)?.actions ?? []).length > 0, true);
    assert.equal(Array.isArray(dashboard.due_schedules), true);
    assert.equal((dashboard.funnel as any).total_applications, 1);
    assert.equal(Array.isArray(runs), true);
    assert.equal(runs.length, 0);
  });
});

test("supervised runtime run persists metadata, logs, and runtime audit linkage", async () => {
  await withInstalledOperator(async ({ stateRoot }) => {
    const run = await startSupervisedRuntimeRun({ role: "scout", mode: "supervised" });
    const finished = await waitForControlPlaneRunFinished(run.id);

    assert.equal(finished.status, "dry_run_prepared");
    assert.equal(typeof finished.runtime_run_id, "string");
    assert.ok(await fs.stat(finished.stdout_path));
    assert.ok(await fs.stat(finished.stderr_path));
    assert.ok(await fs.stat(path.join(stateRoot, "control-plane", "run-events.jsonl")));
    assert.equal(finished.agent_run?.id, finished.runtime_run_id);
    assert.match(finished.stdout_tail, /"status": "dry_run_prepared"/);
  });
});

test("installed control plane HTTP surfaces expose dashboard, run trigger, and tick idempotence", async () => {
  await withInstalledOperator(async ({ appRoot, env, stateRoot }) => {
    const overdueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const db = new DatabaseSync(path.join(stateRoot, "job-search.db"));
    db.exec("UPDATE schedule SET next_run_at = '2099-01-01T00:00:00.000Z'");
    db.prepare("UPDATE schedule SET next_run_at = ? WHERE id = 'daily-scout'").run(overdueAt);
    db.close();

    try {
      await withRunningControlPlane({ appRoot, env }, async ({ baseUrl }) => {
        const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { cache: "no-store" });
        assert.equal(dashboardResponse.ok, true);
        const dashboard = await dashboardResponse.json() as { due_schedules: any[] };
        assert.equal(dashboard.due_schedules.length, 1);

        const runResponse = await fetch(`${baseUrl}/api/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "scout", mode: "supervised" })
        });
        assert.equal(runResponse.status, 202);
        const runPayload = await runResponse.json() as { run: { id: string } };
        const finishedRun = await waitForApiRunFinished(baseUrl, runPayload.run.id);
        assert.equal(finishedRun.status, "dry_run_prepared");
        assert.equal(finishedRun.runtime_result.status, "dry_run_prepared");

        const firstTickResponse = await fetch(`${baseUrl}/api/runtime/tick`, { method: "POST" });
        assert.equal(firstTickResponse.status, 202);
        const firstTick = await firstTickResponse.json() as { run: { id: string } };
        const firstTickRun = await waitForApiRunFinished(baseUrl, firstTick.run.id);
        assert.equal(firstTickRun.status, "ran_schedule");
        assert.equal(firstTickRun.runtime_result.status, "ran_schedule");

        const secondTickResponse = await fetch(`${baseUrl}/api/runtime/tick`, { method: "POST" });
        assert.equal(secondTickResponse.status, 202);
        const secondTick = await secondTickResponse.json() as { run: { id: string } };
        const secondTickRun = await waitForApiRunFinished(baseUrl, secondTick.run.id);
        assert.equal(secondTickRun.status, "no_due_schedule");
        assert.equal(secondTickRun.runtime_result.status, "no_due_schedule");
      });
    } catch (error) {
      if (isListenPermissionError(error)) {
        return;
      }
      throw error;
    }
  });
});

test("installed control plane exposes the supervised application loop over HTTP", async () => {
  await withInstalledOperator(async ({ appRoot, env, dataRoot, stateRoot }) => {
    const service = new JobSearchService({ dataRoot, stateRoot });
    await service.createApplicationPackage({
      application: {
        id: "app-http-loop",
        vacancy_id: "vac-acme-platform-engineer",
        resume_version_id: "resume-http-loop",
        cover_letter_id: "cover-letter-app-http-loop",
        channel: "site",
        status: "dry_run",
        applied_at: null,
        confidence: 0.78,
        auto_sent: false,
        dry_run: true
      },
      cover_letter: {
        id: "cover-letter-app-http-loop",
        application_id: "app-http-loop",
        style: "concise",
        tone: "evidence-led",
        markdown: "Hello Acme.",
        sha: "sha-http-loop",
        generated_by_model: "gpt-5.4-mini"
      },
      letter_markdown: "Hello Acme.",
      screening_answers_markdown: "Q: Why Acme?\nA: Platform scope."
    });

    try {
      await withRunningControlPlane({ appRoot, env }, async ({ baseUrl }) => {
        const applicationsPage = await fetch(`${baseUrl}/applications`, { cache: "no-store" });
        assert.equal(applicationsPage.ok, true);
        assert.match(await applicationsPage.text(), /app-http-loop/);

        const detailPage = await fetch(`${baseUrl}/applications/app-http-loop`, { cache: "no-store" });
        assert.equal(detailPage.ok, true);
        assert.match(await detailPage.text(), /Hello Acme/);

        const statusResponse = await fetch(`${baseUrl}/api/applications/app-http-loop/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "ready_to_send", reason: "approved by reviewer" })
        });
        assert.equal(statusResponse.status, 200);

        const invalidApplied = await fetch(`${baseUrl}/api/applications/app-http-loop/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "applied" })
        });
        assert.equal(invalidApplied.status, 400);

        const eventResponse = await fetch(`${baseUrl}/api/applications/app-http-loop/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "applied",
            evidenceText: "Manual confirmation from company form.",
            evidenceName: "http-loop-applied.txt"
          })
        });
        assert.equal(eventResponse.status, 200);

        const pack = await service.getApplicationPack({ id: "app-http-loop" });
        assert.equal((pack.result as any).application.status, "applied");
        assert.equal((pack.result as any).events.some((event: any) => event.kind === "applied"), true);
      });
    } catch (error) {
      if (isListenPermissionError(error)) {
        return;
      }
      throw error;
    }
  });
});
