import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { scanText } from "./lib/privacy-scanner.mjs";

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();

async function gitLines(args) {
  const { stdout } = await execFile("git", args, { cwd: repoRoot });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isScannable(filePath) {
  const ext = path.extname(filePath);
  return [".md", ".json", ".jsonl", ".yaml", ".yml", ".ts", ".mjs", ".sh", ".txt", ".example"].includes(ext) ||
    path.basename(filePath) === "pre-commit";
}

async function collectTargets(mode) {
  if (mode === "--staged") {
    return gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  }

  if (mode === "--tracked") {
    return gitLines(["ls-files"]);
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

async function main() {
  const mode = process.argv[2] ?? "--tracked";
  const files = (await collectTargets(mode)).filter(isScannable);
  const findings = [];

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    let text;
    try {
      text = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    for (const finding of scanText(text)) {
      findings.push(`${relativePath}: ${finding.description} -> ${finding.match}`);
    }
  }

  if (findings.length > 0) {
    console.error("Privacy guard failed:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Privacy guard passed on ${files.length} file(s).`);
}

await main();
