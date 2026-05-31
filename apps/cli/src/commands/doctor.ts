import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, resolvePaths, STRATEGY_FILES } from "@job-search/core";
import { openAndMigrate } from "@job-search/db";
import { isTypstAvailable } from "@job-search/resume";
import { chromium } from "playwright";

type Status = "ok" | "warn" | "fail";
interface Check {
  name: string;
  status: Status;
  detail: string;
}

function hasBin(bin: string): boolean {
  const which = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(which, [bin], { encoding: "utf8" });
  return result.status === 0;
}

export function runDoctor(): number {
  const env = loadEnv();
  const p = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
  const checks: Check[] = [];

  // .env
  checks.push({
    name: ".env",
    status: existsSync(path.join(p.repoRoot, ".env")) ? "ok" : "warn",
    detail: existsSync(path.join(p.repoRoot, ".env"))
      ? "present"
      : "missing (cp .env.example .env)",
  });

  // data tree
  checks.push({
    name: "data tree",
    status: existsSync(p.dataDir) ? "ok" : "fail",
    detail: existsSync(p.dataDir) ? p.dataDir : "run `job-search init`",
  });

  // sqlite
  try {
    const db = openAndMigrate(p.dbPath);
    db.close();
    checks.push({
      name: "sqlite + migrations",
      status: "ok",
      detail: p.dbPath,
    });
  } catch (error) {
    checks.push({
      name: "sqlite + migrations",
      status: "fail",
      detail: error instanceof Error ? error.message : "failed",
    });
  }

  // typst
  checks.push({
    name: "typst",
    status: isTypstAvailable(env.TYPST_BIN) ? "ok" : "warn",
    detail: isTypstAvailable(env.TYPST_BIN)
      ? "available"
      : `not found (${env.TYPST_BIN}); resume PDFs disabled`,
  });

  // playwright chromium
  let chromiumOk = false;
  try {
    const execPath = chromium.executablePath();
    chromiumOk = Boolean(execPath) && existsSync(execPath);
  } catch {
    chromiumOk = false;
  }
  checks.push({
    name: "playwright chromium",
    status: chromiumOk ? "ok" : "warn",
    detail: chromiumOk
      ? "installed"
      : "run `pnpm exec playwright install chromium`",
  });

  // AI CLIs
  const ais = ["codex", "agent", "claude"].filter(hasBin);
  checks.push({
    name: "AI CLI",
    status: ais.length > 0 ? "ok" : "warn",
    detail:
      ais.length > 0
        ? `found: ${ais.join(", ")}`
        : "none of codex/agent/claude on PATH (AI steps fall back)",
  });

  // telegram
  checks.push({
    name: "telegram",
    status: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? "ok" : "warn",
    detail:
      env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
        ? "configured"
        : "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID empty (notifications off)",
  });

  // HH session
  checks.push({
    name: "hh session",
    status: existsSync(p.storageStatePath) ? "ok" : "warn",
    detail: existsSync(p.storageStatePath)
      ? "saved"
      : "run `job-search hh:login`",
  });

  const lockPath = path.join(p.dataDir, ".pipeline.lock");
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    let alive = false;
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    checks.push({
      name: "pipeline lock",
      status: alive ? "warn" : "ok",
      detail: alive
        ? `running (pid ${pid}) — stop before second \`pnpm dev\``
        : "stale lock cleaned on next start",
    });
  } else {
    checks.push({
      name: "pipeline lock",
      status: "ok",
      detail: "no running pipeline",
    });
  }

  // profile / resume / strategy files
  const profileOk = existsSync(path.join(p.profileDir, "experience-facts.md"));
  checks.push({
    name: "profile files",
    status: profileOk ? "ok" : "warn",
    detail: profileOk ? "present" : "run init + /init skill",
  });
  const resumeOk = existsSync(path.join(p.resumeDir, "master-resume.json"));
  checks.push({
    name: "resume files",
    status: resumeOk ? "ok" : "warn",
    detail: resumeOk ? "present" : "run init + /init skill",
  });
  const missingStrategy = STRATEGY_FILES.filter(
    (name) => !existsSync(path.join(p.strategyDir, `${name}.yaml`)),
  );
  checks.push({
    name: "strategy files",
    status: missingStrategy.length === 0 ? "ok" : "warn",
    detail:
      missingStrategy.length === 0
        ? STRATEGY_FILES.map((n) => `${n}.yaml`).join(", ")
        : `run init (missing: ${missingStrategy.join(", ")})`,
  });

  const icon = (s: Status): string =>
    s === "ok" ? "[ ok ]" : s === "warn" ? "[warn]" : "[FAIL]";
  console.log("job-search doctor\n");
  for (const c of checks) {
    console.log(`${icon(c.status)} ${c.name.padEnd(22)} ${c.detail}`);
  }
  const failed = checks.some((c) => c.status === "fail");
  console.log("");
  console.log(
    failed
      ? "Some checks FAILED. Fix the above before running the pipeline."
      : "Core checks passed.",
  );
  return failed ? 1 : 0;
}
