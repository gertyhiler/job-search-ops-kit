import fs from "node:fs";

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Ensure only one long-lived pipeline process polls/schedules at a time. */
export function acquirePipelineLock(lockPath: string): { release: () => void } {
  if (fs.existsSync(lockPath)) {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const existingPid = Number(raw);
    if (isProcessRunning(existingPid)) {
      throw new Error(
        `Pipeline already running (pid ${existingPid}). Stop it before starting another \`pnpm dev\`.`,
      );
    }
    fs.unlinkSync(lockPath);
  }

  fs.writeFileSync(lockPath, String(process.pid), "utf8");

  const release = (): void => {
    try {
      if (fs.existsSync(lockPath)) {
        const owner = Number(fs.readFileSync(lockPath, "utf8").trim());
        if (owner === process.pid) fs.unlinkSync(lockPath);
      }
    } catch {
      // best-effort
    }
  };

  process.on("exit", release);
  return { release };
}
