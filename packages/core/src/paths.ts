import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from this module to find the monorepo root (has pnpm-workspace.yaml). */
export function findRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export interface Paths {
  repoRoot: string;
  configDefaultsDir: string;
  promptsDir: string;
  skillsDir: string;

  dataDir: string;
  dbPath: string;

  profileDir: string;
  strategyDir: string;
  templatesDir: string;

  resumeDir: string;
  resumeVariantsDir: string;

  memoryDir: string;
  journalDir: string;
  inboxDir: string;
  insightsDir: string;
  healthDir: string;

  browserDir: string;
  storageStatePath: string;
  screenshotsDir: string;
  tracesDir: string;

  exportsDir: string;
  reportsDir: string;
  resumeRendersDir: string;
}

function resolveFromRoot(repoRoot: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

export function resolvePaths(
  opts: { dataDir?: string; dbPath?: string } = {},
): Paths {
  const repoRoot = findRepoRoot();
  const dataDir = resolveFromRoot(repoRoot, opts.dataDir ?? "data");
  const dbPath = resolveFromRoot(
    repoRoot,
    opts.dbPath ?? path.join(dataDir, "db", "job-search.sqlite"),
  );

  const memoryDir = path.join(dataDir, "memory");
  const browserDir = path.join(dataDir, "browser");
  const exportsDir = path.join(dataDir, "exports");
  const resumeDir = path.join(dataDir, "resume");

  return {
    repoRoot,
    configDefaultsDir: path.join(repoRoot, "config", "defaults"),
    promptsDir: path.join(repoRoot, "prompts"),
    skillsDir: path.join(repoRoot, ".agents", "skills"),

    dataDir,
    dbPath,

    profileDir: path.join(dataDir, "profile"),
    strategyDir: path.join(dataDir, "strategy"),
    templatesDir: path.join(dataDir, "templates"),

    resumeDir,
    resumeVariantsDir: path.join(resumeDir, "variants"),

    memoryDir,
    journalDir: path.join(memoryDir, "journal"),
    inboxDir: path.join(memoryDir, "inbox"),
    insightsDir: path.join(memoryDir, "insights"),
    healthDir: path.join(memoryDir, "health"),

    browserDir,
    storageStatePath: path.join(browserDir, "hh-storage-state.json"),
    screenshotsDir: path.join(browserDir, "screenshots"),
    tracesDir: path.join(browserDir, "traces"),

    exportsDir,
    reportsDir: path.join(exportsDir, "reports"),
    resumeRendersDir: path.join(exportsDir, "resume"),
  };
}
