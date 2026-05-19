import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildOperatorBundle, installOperatorBundle } from "../scripts/lib/operator-runtime.ts";

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

function isListenPermissionFailure(message: string): boolean {
  return /\bEPERM\b|\bEACCES\b|operation not permitted/i.test(message);
}

async function callHttpMcp(baseUrl: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  assert.equal(response.ok, true);
  return response.json();
}

function encodeMcpMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "utf8"), payload]);
}

async function readMcpMessage(child: ReturnType<typeof spawn>): Promise<any> {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    if (!child.stdout) {
      throw new Error("Expected child stdout to be available.");
    }
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerRaw = buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthHeader = headerRaw
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));
      if (!contentLengthHeader) {
        return;
      }

      const contentLength = Number.parseInt(contentLengthHeader.split(":")[1].trim(), 10);
      const payloadStart = headerEnd + 4;
      const payloadEnd = payloadStart + contentLength;
      if (buffer.byteLength < payloadEnd) {
        return;
      }

      const payload = buffer.subarray(payloadStart, payloadEnd).toString("utf8");
      child.stdout?.off("data", onData);
      resolve(JSON.parse(payload));
    };

    child.stdout.on("data", onData);
  });
}

async function withInstalledOperator(fn: (ctx: {
  appRoot: string;
  configRoot: string;
  dataRoot: string;
  stateRoot: string;
  env: NodeJS.ProcessEnv;
}) => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-runtime-"));
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
    assert.equal(replay.code, 0);

    await fn({
      appRoot: installResult.appRoot,
      configRoot: installResult.configRoot,
      dataRoot: installResult.dataRoot,
      stateRoot: installResult.stateRoot,
      env
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("source repo runtime CLI refuses to run without installed app context", async () => {
  const env = { ...process.env };
  delete env.JOB_SEARCH_APP_ROOT;

  const result = await execNode([
    "--experimental-strip-types",
    path.join(process.cwd(), "packages", "cli", "bin.ts"),
    "runtime",
    "tick"
  ], env);

  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes("installed operator app"));
});

test("installed MCP server exposes the expected M4 tool surface", async () => {
  await withInstalledOperator(async ({ appRoot, env }) => {
    const child = spawn(process.execPath, [path.join(appRoot, "packages", "mcp-server", "dist", "index.js")], {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdin.write(encodeMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {}
    }));
    const initialize = await readMcpMessage(child);
    assert.equal(initialize.result.serverInfo.name, "job-search-mcp");

    child.stdin.write(encodeMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }));
    const tools = await readMcpMessage(child);
    const toolNames = tools.result.tools.map((tool: any) => tool.name);

    assert.ok(toolNames.includes("create_vacancy"));
    assert.ok(toolNames.includes("next_actions"));

    child.kill();
  });
});

test("installed CLI mirrors MCP tool calls and preserves audit writes", async () => {
  await withInstalledOperator(async ({ appRoot, dataRoot, stateRoot, env }) => {
    const bootstrap = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "mcp",
      "call",
      "bootstrap_operator"
    ], env);

    assert.equal(bootstrap.code, 0);
    const bootstrapPayload = JSON.parse(bootstrap.stdout);
    assert.equal(bootstrapPayload.tool, "bootstrap_operator");
    assert.equal(bootstrapPayload.result.status.appRoot, appRoot);
    assert.equal(typeof bootstrapPayload.result.status.onboarding.ready, "boolean");

    const journal = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "mcp",
      "call",
      "write_journal_entry",
      "--args",
      JSON.stringify({
        entry_id: "cli-mcp-transport-check",
        summary_markdown: "CLI mirror is working.",
        role: "support",
        ts: "2026-05-19T12:00:00.000Z"
      })
    ], env);

    assert.equal(journal.code, 0);
    const journalPayload = JSON.parse(journal.stdout);
    assert.equal(journalPayload.tool, "write_journal_entry");
    assert.equal(journalPayload.result.entry_id, "cli-mcp-transport-check");

    const auditText = await fs.readFile(path.join(stateRoot, "audit", "mcp-tool-calls.jsonl"), "utf8");
    assert.match(auditText, /"tool":"bootstrap_operator"/);
    assert.match(auditText, /"tool":"write_journal_entry"/);
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "journal", "2026", "2026-05-19-cli-mcp-transport-check.md")));
  });
});

test("installed runtime prepares dry-run scout and memory-manager runs and audits them", async () => {
  await withInstalledOperator(async ({ appRoot, stateRoot, env }) => {
    const scout = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "runtime",
      "run",
      "--role",
      "scout"
    ], env);
    const memoryManager = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "runtime",
      "run",
      "--role",
      "memory-manager"
    ], env);

    assert.equal(scout.code, 0);
    assert.equal(memoryManager.code, 0);

    const scoutPayload = JSON.parse(scout.stdout);
    const memoryPayload = JSON.parse(memoryManager.stdout);
    const auditLines = (await fs.readFile(path.join(stateRoot, "audit", "agent_runs.jsonl"), "utf8")).trim().split("\n");

    assert.equal(scoutPayload.status, "dry_run_prepared");
    assert.equal(memoryPayload.status, "dry_run_prepared");
    assert.equal(auditLines.length, 2);
    assert.ok(await fs.stat(scoutPayload.notes_path));
    assert.ok(await fs.stat(memoryPayload.notes_path));
  });
});

test("runtime tick advances one overdue schedule and becomes idempotent on the second pass", async () => {
  await withInstalledOperator(async ({ appRoot, stateRoot, env }) => {
    const overdueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const db = new DatabaseSync(path.join(stateRoot, "job-search.db"));
    db.exec("UPDATE schedule SET next_run_at = '2099-01-01T00:00:00.000Z'");
    db.prepare("UPDATE schedule SET next_run_at = ? WHERE id = 'daily-scout'").run(overdueAt);
    db.close();

    const first = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "runtime",
      "tick"
    ], env);
    const second = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "runtime",
      "tick"
    ], env);

    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(first.stdout).status, "ran_schedule");
    assert.equal(JSON.parse(second.stdout).status, "no_due_schedule");

    const verifyDb = new DatabaseSync(path.join(stateRoot, "job-search.db"));
    const row: any = verifyDb.prepare("SELECT last_status, fails_in_a_row, next_run_at FROM schedule WHERE id = 'daily-scout'").get();
    verifyDb.close();

    assert.equal(row.last_status, "dry_run_prepared");
    assert.equal(row.fails_in_a_row, 0);
    assert.notEqual(row.next_run_at, overdueAt);
  });
});

test("applier prepares supervised manual outbox preview without browser submission", async () => {
  await withInstalledOperator(async ({ appRoot, env }) => {
    const result = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "runtime",
      "run",
      "--role",
      "applier"
    ], env);

    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "dry_run_prepared");
    assert.equal(payload.role, "applier");
  });
});

test("installed service manager starts app and MCP in background, exposes health, and stops cleanly", async () => {
  await withInstalledOperator(async ({ appRoot, env, stateRoot }) => {
    let appPort: number;
    let mcpPort: number;
    try {
      appPort = await getFreePort();
      mcpPort = await getFreePort();
    } catch (error) {
      if (isListenPermissionFailure(error instanceof Error ? error.message : String(error))) {
        return;
      }
      throw error;
    }

    const start = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "start",
      "--app-port",
      String(appPort),
      "--mcp-port",
      String(mcpPort)
    ], env);

    if (start.code !== 0 && isListenPermissionFailure(start.stderr)) {
      return;
    }

    assert.equal(start.code, 0, start.stderr);
    const startPayload = JSON.parse(start.stdout);
    assert.equal(startPayload.status, "started");
    assert.equal(startPayload.services.app.status, "running");
    assert.equal(startPayload.services.mcp.status, "running");

    const appBaseUrl = `http://127.0.0.1:${appPort}`;
    const mcpBaseUrl = `http://127.0.0.1:${mcpPort}`;

    try {
      await waitFor(async () => {
        try {
          const response = await fetch(`${appBaseUrl}/api/dashboard`, { cache: "no-store" });
          return response.ok ? true : null;
        } catch {
          return null;
        }
      }, 20000);

      await waitFor(async () => {
        try {
          const response = await fetch(`${mcpBaseUrl}/health`, { cache: "no-store" });
          return response.ok ? true : null;
        } catch {
          return null;
        }
      }, 20000);

      const status = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "status"
      ], env);
      assert.equal(status.code, 0, status.stderr);
      const statusPayload = JSON.parse(status.stdout);
      assert.equal(statusPayload.services.app.status, "running");
      assert.equal(statusPayload.services.mcp.status, "running");
      assert.equal(statusPayload.services.app.port, appPort);
      assert.equal(statusPayload.services.mcp.port, mcpPort);

      const initialize = await callHttpMcp(mcpBaseUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {}
      });
      assert.equal(initialize.result.serverInfo.name, "job-search-mcp");

      const toolList = await callHttpMcp(mcpBaseUrl, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      });
      const toolNames = toolList.result.tools.map((tool: any) => tool.name);
      assert.ok(toolNames.includes("get_operator_status"));

      const toolCall = await callHttpMcp(mcpBaseUrl, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_operator_status",
          arguments: {}
        }
      });
      assert.equal(toolCall.result.structuredContent.appRoot, appRoot);

      const logs = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "logs",
        "mcp",
        "--lines",
        "20"
      ], env);
      assert.equal(logs.code, 0, logs.stderr);
      const logsPayload = JSON.parse(logs.stdout);
      assert.equal(logsPayload.service, "mcp");
      assert.equal(typeof logsPayload.stdout_path, "string");
      assert.equal(typeof logsPayload.stderr_path, "string");

      const secondStart = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "start",
        "--app-port",
        String(appPort),
        "--mcp-port",
        String(mcpPort)
      ], env);
      assert.equal(secondStart.code, 0, secondStart.stderr);
      const secondPayload = JSON.parse(secondStart.stdout);
      assert.equal(secondPayload.status, "already_running");

      assert.ok(await fs.stat(path.join(stateRoot, "services", "app", "meta.json")));
      assert.ok(await fs.stat(path.join(stateRoot, "services", "mcp", "meta.json")));
    } finally {
      const stop = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "stop"
      ], env);
      assert.equal(stop.code, 0, stop.stderr);

      const finalStatus = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "status"
      ], env);
      assert.equal(finalStatus.code, 0, finalStatus.stderr);
      const finalPayload = JSON.parse(finalStatus.stdout);
      assert.equal(finalPayload.services.app.status, "stopped");
      assert.equal(finalPayload.services.mcp.status, "stopped");
    }
  });
});

test("service manager marks dead service processes stale and recreates them on next start", async () => {
  await withInstalledOperator(async ({ appRoot, env }) => {
    let appPort: number;
    let mcpPort: number;
    try {
      appPort = await getFreePort();
      mcpPort = await getFreePort();
    } catch (error) {
      if (isListenPermissionFailure(error instanceof Error ? error.message : String(error))) {
        return;
      }
      throw error;
    }

    const start = await execNode([
      "--experimental-strip-types",
      path.join(appRoot, "packages", "cli", "bin.ts"),
      "start",
      "--app-port",
      String(appPort),
      "--mcp-port",
      String(mcpPort)
    ], env);

    if (start.code !== 0 && isListenPermissionFailure(start.stderr)) {
      return;
    }

    assert.equal(start.code, 0, start.stderr);

    try {
      const firstStatus = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "status"
      ], env);
      assert.equal(firstStatus.code, 0, firstStatus.stderr);
      const firstPayload = JSON.parse(firstStatus.stdout);
      const mcpPid = firstPayload.services.mcp.pid;
      assert.equal(typeof mcpPid, "number");

      process.kill(mcpPid, "SIGKILL");
      await waitFor(async () => {
        const status = await execNode([
          "--experimental-strip-types",
          path.join(appRoot, "packages", "cli", "bin.ts"),
          "status"
        ], env);
        const payload = JSON.parse(status.stdout);
        return payload.services.mcp.status === "stale" ? payload : null;
      }, 20000);

      const restart = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "start",
        "--app-port",
        String(appPort),
        "--mcp-port",
        String(mcpPort)
    ], env);
      assert.equal(restart.code, 0, restart.stderr);
      const restartPayload = JSON.parse(restart.stdout);
      assert.equal(restartPayload.services.mcp.status, "running");
      assert.notEqual(restartPayload.services.mcp.pid, mcpPid);
    } finally {
      const stop = await execNode([
        "--experimental-strip-types",
        path.join(appRoot, "packages", "cli", "bin.ts"),
        "stop"
      ], env);
      assert.equal(stop.code, 0, stop.stderr);
    }
  });
});
