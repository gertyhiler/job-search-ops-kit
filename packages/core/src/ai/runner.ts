import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface AiCommandInput {
  command: string;
  args: string[];
  stdinPayload?: unknown;
  stdinText?: string;
  promptArgs?: string[];
  timeoutMs: number;
  maxRetries: number;
  env?: NodeJS.ProcessEnv;
}

export interface AiCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  attempt: number;
}

const activeChildren = new Set<ChildProcessWithoutNullStreams>();

function trackChild(child: ChildProcessWithoutNullStreams): void {
  activeChildren.add(child);
  const cleanup = (): void => {
    activeChildren.delete(child);
  };
  child.once("close", cleanup);
  child.once("error", cleanup);
}

async function terminateChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once("close", finish);
    child.once("error", finish);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!settled && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 1000).unref?.();
  });
}

async function runOnce(
  input: AiCommandInput,
  attempt: number,
): Promise<AiCommandResult> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(
      input.command,
      [...input.args, ...(input.promptArgs ?? [])],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...input.env },
      },
    );
    trackChild(child);

    let stdout = "";
    let stderr = "";
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 1000);
      finishReject(new Error(`AI command timeout after ${input.timeoutMs} ms`));
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      finishReject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(
          new Error(
            `AI command failed with code ${exitCode}. stderr=${stderr.trim() || "<empty>"}`,
          ),
        );
        return;
      }
      resolve({
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - startedAt,
        attempt,
      });
    });

    if (typeof input.stdinText === "string") {
      child.stdin.write(input.stdinText);
      child.stdin.end();
      return;
    }
    if (typeof input.stdinPayload !== "undefined") {
      child.stdin.write(`${JSON.stringify(input.stdinPayload)}\n`);
      child.stdin.end();
      return;
    }
    child.stdin.end();
  });
}

export async function runAiCommand(
  input: AiCommandInput,
): Promise<AiCommandResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.maxRetries + 1; attempt += 1) {
    try {
      return await runOnce(input, attempt);
    } catch (error) {
      lastError = error;
      if (attempt > input.maxRetries) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unknown AI command failure");
}

export async function shutdownActiveAiCommands(): Promise<void> {
  const children = [...activeChildren];
  if (children.length === 0) return;
  await Promise.allSettled(children.map((child) => terminateChild(child)));
}
