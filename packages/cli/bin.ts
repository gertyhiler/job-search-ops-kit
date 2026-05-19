#!/usr/bin/env -S node --experimental-strip-types
import path from "node:path";
import { bootstrapOperatorEnvironment, getOperatorWorkflowStatus } from "../core/index.ts";
import { migrateDatabase, replayDatabase } from "../db/index.ts";
import { JobSearchService } from "../mcp-server/service.ts";
import { startMcpServer } from "../mcp-server/index.ts";
import { runRole, tickRuntime } from "../runtime/index.ts";
import { startControlPlaneServer } from "../runtime/control-plane.ts";
import {
  getManagedServiceLogs,
  getManagedServicesStatus,
  parsePositiveInteger,
  startManagedServices,
  stopManagedServices,
  type ManagedServiceName
} from "../runtime/services.ts";

function usage(): string {
  return [
    "Usage:",
    "  job-search start [--app-port 3000] [--app-hostname 127.0.0.1] [--mcp-port 3760] [--mcp-hostname 127.0.0.1]",
    "  job-search stop",
    "  job-search status",
    "  job-search logs [app|mcp] [--lines 200]",
    "  job-search db migrate [--db /abs/path/to/job-search.db] [--data /abs/path/to/data-root] [--state /abs/path/to/state-root]",
    "  job-search db replay  [--db /abs/path/to/job-search.db] [--data /abs/path/to/data-root] [--state /abs/path/to/state-root]",
    "  job-search operator status",
    "  job-search operator bootstrap",
    "  job-search mcp serve [--transport stdio|http] [--hostname 127.0.0.1] [--port 3760]",
    "  job-search mcp call <tool> [--args '<json>']",
    "  job-search runtime run --role <role> [--schedule <id>] [--mode background|supervised|interactive_external]",
    "  job-search runtime tick",
    "  job-search app start [--port 3000] [--hostname 127.0.0.1]"
  ].join("\n");
}

function parseJsonToolArgs(rawValue: string): Record<string, unknown> {
  const parsed = JSON.parse(rawValue) as unknown;
  if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("MCP tool args must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function parseMcpCallOptions(args: string[]): { toolName?: string; toolArgs: Record<string, unknown> } {
  const options: { toolName?: string; toolArgs: Record<string, unknown> } = {
    toolArgs: {}
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === "--args") {
      if (!value) {
        throw new Error("Missing value for --args.");
      }
      options.toolArgs = parseJsonToolArgs(value);
      index += 1;
      continue;
    }

    if (!token.startsWith("--") && !options.toolName) {
      options.toolName = token;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseOptions(args: string[]): { dbPath?: string; dataRoot?: string; stateRoot?: string } {
  const options: { dbPath?: string; dataRoot?: string; stateRoot?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if ((token === "--db" || token === "--data" || token === "--state") && !value) {
      throw new Error(`Missing value for ${token}.`);
    }

    if (token === "--db") {
      options.dbPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (token === "--data") {
      options.dataRoot = path.resolve(value);
      index += 1;
      continue;
    }

    if (token === "--state") {
      options.stateRoot = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseRuntimeOptions(args: string[]): { role?: string; scheduleId?: string; mode?: "background" | "supervised" | "interactive_external" } {
  const options: { role?: string; scheduleId?: string; mode?: "background" | "supervised" | "interactive_external" } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if ((token === "--role" || token === "--schedule" || token === "--mode") && !value) {
      throw new Error(`Missing value for ${token}.`);
    }

    if (token === "--role") {
      options.role = value;
      index += 1;
      continue;
    }

    if (token === "--schedule") {
      options.scheduleId = value;
      index += 1;
      continue;
    }

    if (token === "--mode") {
      if (!["background", "supervised", "interactive_external"].includes(value)) {
        throw new Error(`Unsupported mode "${value}".`);
      }
      options.mode = value as "background" | "supervised" | "interactive_external";
      index += 1;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseAppStartOptions(args: string[]): { port?: number; hostname?: string } {
  const options: { port?: number; hostname?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if ((token === "--port" || token === "--hostname") && !value) {
      throw new Error(`Missing value for ${token}.`);
    }

    if (token === "--port") {
      const port = Number.parseInt(value, 10);
      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`Invalid port "${value}".`);
      }
      options.port = port;
      index += 1;
      continue;
    }

    if (token === "--hostname") {
      options.hostname = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseMcpServeOptions(args: string[]): {
  transport?: "http" | "stdio";
  port?: number;
  hostname?: string;
} {
  const options: { transport?: "http" | "stdio"; port?: number; hostname?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if ((token === "--transport" || token === "--port" || token === "--hostname") && !value) {
      throw new Error(`Missing value for ${token}.`);
    }

    if (token === "--transport") {
      if (!["http", "stdio"].includes(value)) {
        throw new Error(`Unsupported transport "${value}".`);
      }
      options.transport = value as "http" | "stdio";
      index += 1;
      continue;
    }

    if (token === "--port") {
      options.port = parsePositiveInteger(value, "port");
      index += 1;
      continue;
    }

    if (token === "--hostname") {
      options.hostname = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseStartOptions(args: string[]): {
  appPort?: number;
  appHostname?: string;
  mcpPort?: number;
  mcpHostname?: string;
} {
  const options: { appPort?: number; appHostname?: string; mcpPort?: number; mcpHostname?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if ((token === "--app-port" || token === "--app-hostname" || token === "--mcp-port" || token === "--mcp-hostname") && !value) {
      throw new Error(`Missing value for ${token}.`);
    }

    if (token === "--app-port") {
      options.appPort = parsePositiveInteger(value, "app port");
      index += 1;
      continue;
    }

    if (token === "--app-hostname") {
      options.appHostname = value;
      index += 1;
      continue;
    }

    if (token === "--mcp-port") {
      options.mcpPort = parsePositiveInteger(value, "mcp port");
      index += 1;
      continue;
    }

    if (token === "--mcp-hostname") {
      options.mcpHostname = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function parseLogsOptions(args: string[]): { service?: ManagedServiceName; lines: number } {
  const options: { service?: ManagedServiceName; lines: number } = {
    lines: 200
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === "--lines") {
      if (!value) {
        throw new Error("Missing value for --lines.");
      }
      options.lines = parsePositiveInteger(value, "lines");
      index += 1;
      continue;
    }

    if (!token.startsWith("--") && !options.service) {
      if (!["app", "mcp"].includes(token)) {
        throw new Error(`Unknown service "${token}".`);
      }
      options.service = token as ManagedServiceName;
      continue;
    }

    throw new Error(`Unknown option "${token}".`);
  }

  return options;
}

function assertNoExtraArgs(commandName: string, args: string[]): void {
  if (args.length > 0) {
    throw new Error(`${commandName} does not accept arguments.`);
  }
}

async function main(): Promise<void> {
  const [, , group, command, ...args] = process.argv;
  if (group === "start") {
    console.log(JSON.stringify(await startManagedServices(parseStartOptions([command, ...args].filter(Boolean) as string[])), null, 2));
    return;
  }

  if (group === "stop") {
    assertNoExtraArgs("stop", [command, ...args].filter(Boolean) as string[]);
    console.log(JSON.stringify(await stopManagedServices(), null, 2));
    return;
  }

  if (group === "status") {
    assertNoExtraArgs("status", [command, ...args].filter(Boolean) as string[]);
    console.log(JSON.stringify(await getManagedServicesStatus(), null, 2));
    return;
  }

  if (group === "logs") {
    const options = parseLogsOptions([command, ...args].filter(Boolean) as string[]);
    const service = options.service ?? "app";
    console.log(JSON.stringify(await getManagedServiceLogs(service, options.lines), null, 2));
    return;
  }

  if (group === "db" && (command === "migrate" || command === "replay")) {
    const options = parseOptions(args);

    if (command === "migrate") {
      const result = await migrateDatabase(options);
      console.log(`DB ready: ${result.dbPath}`);
      console.log(`Applied migrations: ${result.appliedMigrations.length}`);
      console.log(`Seeded schedules: ${result.seededSchedules.length}`);
      console.log(`Preserved schedules: ${result.preservedSchedules.length}`);
      return;
    }

    const result = await replayDatabase(options);
    console.log(`Replay complete: ${result.dbPath}`);
    for (const [tableName, count] of Object.entries(result.rowCounts)) {
      console.log(`${tableName}: ${count}`);
    }
    return;
  }

  if (group === "mcp" && command === "serve") {
    await startMcpServer(parseMcpServeOptions(args));
    return;
  }

  if (group === "mcp" && command === "call") {
    const { toolName, toolArgs } = parseMcpCallOptions(args);
    if (!toolName) {
      throw new Error("Missing MCP tool name.");
    }
    const service = new JobSearchService();
    const result = await service.callTool(toolName, toolArgs);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "operator" && command === "status") {
    console.log(JSON.stringify(await getOperatorWorkflowStatus(), null, 2));
    return;
  }

  if (group === "operator" && command === "bootstrap") {
    const bootstrap = await bootstrapOperatorEnvironment();
    await replayDatabase({
      dataRoot: bootstrap.dataRoot,
      stateRoot: bootstrap.stateRoot
    });
    console.log(JSON.stringify({
      bootstrap,
      status: await getOperatorWorkflowStatus()
    }, null, 2));
    return;
  }

  if (group === "runtime" && command === "run") {
    const result = await runRole(parseRuntimeOptions(args));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "runtime" && command === "tick") {
    const result = await tickRuntime();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "app" && command === "start") {
    const exitCode = await startControlPlaneServer(parseAppStartOptions(args));
    process.exitCode = exitCode;
    return;
  }

  console.error(usage());
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
