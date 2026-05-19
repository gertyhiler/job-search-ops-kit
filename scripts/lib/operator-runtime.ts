import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { migrateDatabase } from "../../packages/db/database.ts";
import { replayDatabase } from "../../packages/db/replay.ts";
import {
  getAppRoot,
  getBinRoot,
  getCacheRoot,
  getConfigRoot,
  getDataRoot,
  getRepoRoot,
  getStateRoot,
} from "../../packages/core/paths.ts";
import { bootstrapOperatorEnvironment } from "../../packages/core/bootstrap.ts";

export interface OperatorRoots {
  appRoot: string;
  binRoot: string;
  cacheRoot: string;
  configRoot: string;
  dataRoot: string;
  stateRoot: string;
}

export interface BuildOperatorBundleResult {
  bundleRoot: string;
  manifestPath: string;
  version: string;
  files: string[];
}

export interface InstallOperatorBundleResult extends OperatorRoots {
  launcherPaths: string[];
}

let controlPlaneBuildPromise: Promise<void> | null = null;

const BUNDLE_DIRECTORY_MAPPINGS = [
  { source: "packages/core", target: "packages/core" },
  { source: "packages/db", target: "packages/db" },
  { source: "packages/cli", target: "packages/cli" },
  { source: "packages/mcp-server", target: "packages/mcp-server" },
  { source: "packages/runtime", target: "packages/runtime" },
  { source: "packages/control-plane", target: "packages/control-plane" },
  {
    source: "packages/browser-automation",
    target: "packages/browser-automation",
  },
  { source: "prompts", target: "prompts" },
  { source: "automations", target: "automations" },
  { source: "routing", target: "routing" },
  { source: "schemas", target: "schemas" },
  { source: "config/defaults", target: "config/defaults" },
  { source: "operator/.agents", target: ".agents" },
  { source: "operator/.codex", target: ".codex" },
  { source: "operator/.cursor", target: ".cursor" },
] as const;

const BUNDLE_FILE_MAPPINGS = [
  { source: "package.json", target: "package.json" },
  { source: ".env.example", target: ".env.example" },
  { source: "LICENSE", target: "LICENSE" },
  { source: "operator/AGENTS.md", target: "AGENTS.md" },
] as const;

const TEMPLATE_REPLACEMENTS = [
  "__JOB_SEARCH_APP_ROOT__",
  "__JOB_SEARCH_CONFIG_DIR__",
  "__JOB_SEARCH_DATA_DIR__",
  "__JOB_SEARCH_STATE_DIR__",
  "__JOB_SEARCH_CACHE_DIR__",
] as const;

function resolveRoots(overrides: Partial<OperatorRoots> = {}): OperatorRoots {
  return {
    appRoot: overrides.appRoot ?? getAppRoot(),
    binRoot: overrides.binRoot ?? getBinRoot(),
    cacheRoot: overrides.cacheRoot ?? getCacheRoot(),
    configRoot: overrides.configRoot ?? getConfigRoot(),
    dataRoot: overrides.dataRoot ?? getDataRoot(),
    stateRoot: overrides.stateRoot ?? getStateRoot(),
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")} (exit ${code ?? 0})`,
        ),
      );
    });
  });
}

async function copyDirectory(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    force: true,
  });
}

function getControlPlaneStandaloneServer(controlPlaneRoot: string): string {
  return path.join(
    controlPlaneRoot,
    ".next",
    "standalone",
    "packages",
    "control-plane",
    "server.js",
  );
}

async function ensureControlPlaneStandaloneAssets(
  controlPlaneRoot: string,
): Promise<void> {
  const staticSource = path.join(controlPlaneRoot, ".next", "static");
  const staticTarget = path.join(
    controlPlaneRoot,
    ".next",
    "standalone",
    "packages",
    "control-plane",
    ".next",
    "static",
  );

  if (!(await pathExists(staticSource))) {
    return;
  }

  await ensureDirectory(path.dirname(staticTarget));
  await copyDirectory(staticSource, staticTarget);
}

async function ensureControlPlaneBuild(repoRoot: string): Promise<void> {
  const controlPlaneRoot = path.join(repoRoot, "packages", "control-plane");
  if (!(await pathExists(controlPlaneRoot))) {
    return;
  }

  const standaloneServer = getControlPlaneStandaloneServer(controlPlaneRoot);
  const standaloneRoot = path.join(controlPlaneRoot, ".next", "standalone");
  if (await pathExists(standaloneServer)) {
    await ensureControlPlaneStandaloneAssets(controlPlaneRoot);
    return;
  }

  if (!controlPlaneBuildPromise) {
    await fs.rm(standaloneRoot, { recursive: true, force: true });
    controlPlaneBuildPromise = runCommand(
      "pnpm",
      ["--dir", controlPlaneRoot, "build"],
      repoRoot,
    ).finally(() => {
      controlPlaneBuildPromise = null;
    });
  }

  await controlPlaneBuildPromise;
  await ensureControlPlaneStandaloneAssets(controlPlaneRoot);
}

async function listFiles(rootPath: string): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readPackageVersion(repoRoot: string): Promise<string> {
  const raw = await fs.readFile(path.join(repoRoot, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? "0.0.0-dev";
}

function renderTemplate(template: string, roots: OperatorRoots): string {
  const replacements: Record<(typeof TEMPLATE_REPLACEMENTS)[number], string> = {
    __JOB_SEARCH_APP_ROOT__: roots.appRoot,
    __JOB_SEARCH_CONFIG_DIR__: roots.configRoot,
    __JOB_SEARCH_DATA_DIR__: roots.dataRoot,
    __JOB_SEARCH_STATE_DIR__: roots.stateRoot,
    __JOB_SEARCH_CACHE_DIR__: roots.cacheRoot,
  };

  return TEMPLATE_REPLACEMENTS.reduce(
    (result, token) => result.replaceAll(token, replacements[token]),
    template,
  );
}

async function renderRuntimeMcpConfigs(
  appRoot: string,
  roots: OperatorRoots,
): Promise<void> {
  const codexTemplatePath = path.join(
    appRoot,
    ".codex",
    "config.template.toml",
  );
  const codexConfigPath = path.join(appRoot, ".codex", "config.toml");
  const codexLegacyMcpJson = path.join(appRoot, ".codex", "mcp.json");

  const codexRaw = await fs.readFile(codexTemplatePath, "utf8");
  await fs.writeFile(codexConfigPath, renderTemplate(codexRaw, roots), "utf8");

  if (await pathExists(codexLegacyMcpJson)) {
    await fs.unlink(codexLegacyMcpJson);
  }

  const cursorTemplatePath = path.join(appRoot, ".cursor", "mcp.template.json");
  const cursorRaw = await fs.readFile(cursorTemplatePath, "utf8");
  const cursorRendered = renderTemplate(cursorRaw, roots);
  const cursorOutputPath = cursorTemplatePath.replace(
    ".template.json",
    ".json",
  );
  await fs.writeFile(cursorOutputPath, cursorRendered, "utf8");
}

async function writeLauncher(
  targetPath: string,
  roots: OperatorRoots,
): Promise<void> {
  const script = [
    "#!/bin/sh",
    "set -eu",
    `export JOB_SEARCH_APP_ROOT='${roots.appRoot}'`,
    `export JOB_SEARCH_CONFIG_DIR='${roots.configRoot}'`,
    `export JOB_SEARCH_DATA_DIR='${roots.dataRoot}'`,
    `export JOB_SEARCH_STATE_DIR='${roots.stateRoot}'`,
    `export JOB_SEARCH_CACHE_DIR='${roots.cacheRoot}'`,
    'exec node --experimental-strip-types "$JOB_SEARCH_APP_ROOT/packages/cli/bin.ts" "$@"',
  ].join("\n");

  await ensureDirectory(path.dirname(targetPath));
  await fs.writeFile(targetPath, `${script}\n`, "utf8");
  await fs.chmod(targetPath, 0o755);
}

export async function buildOperatorBundle(
  options: { outputRoot?: string; repoRoot?: string } = {},
): Promise<BuildOperatorBundleResult> {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const outputRoot =
    options.outputRoot ?? path.join(repoRoot, "dist", "operator-bundle");
  await ensureControlPlaneBuild(repoRoot);

  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDirectory(outputRoot);

  for (const mapping of BUNDLE_DIRECTORY_MAPPINGS) {
    await copyDirectory(
      path.join(repoRoot, mapping.source),
      path.join(outputRoot, mapping.target),
    );
  }

  for (const mapping of BUNDLE_FILE_MAPPINGS) {
    await ensureDirectory(path.dirname(path.join(outputRoot, mapping.target)));
    await fs.copyFile(
      path.join(repoRoot, mapping.source),
      path.join(outputRoot, mapping.target),
    );
  }

  const version = await readPackageVersion(repoRoot);
  await fs.writeFile(path.join(outputRoot, "VERSION"), `${version}\n`, "utf8");

  const files = (await listFiles(outputRoot)).map((absolutePath) =>
    path.relative(outputRoot, absolutePath),
  );
  const manifestPath = path.join(outputRoot, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version,
        generated_at: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    bundleRoot: outputRoot,
    manifestPath,
    version,
    files,
  };
}

export async function installOperatorBundle(
  options: Partial<OperatorRoots> & {
    bundleRoot?: string;
    allowReplace?: boolean;
  } = {},
): Promise<InstallOperatorBundleResult> {
  const roots = resolveRoots(options);
  const bundleRoot =
    options.bundleRoot ?? path.join(getRepoRoot(), "dist", "operator-bundle");

  if (!(await pathExists(bundleRoot))) {
    throw new Error(`Operator bundle is missing: ${bundleRoot}`);
  }

  if (!options.allowReplace && (await pathExists(roots.appRoot))) {
    throw new Error(
      `App root already exists: ${roots.appRoot}. Use update:operator instead.`,
    );
  }

  if (options.allowReplace) {
    await fs.rm(roots.appRoot, { recursive: true, force: true });
  }

  await ensureDirectory(path.dirname(roots.appRoot));
  await copyDirectory(bundleRoot, roots.appRoot);
  await ensureDirectory(roots.binRoot);
  await ensureDirectory(roots.cacheRoot);
  await bootstrapOperatorEnvironment({
    configRoot: roots.configRoot,
    dataRoot: roots.dataRoot,
    stateRoot: roots.stateRoot,
  });
  await renderRuntimeMcpConfigs(roots.appRoot, roots);

  const launcherPaths = [
    path.join(roots.binRoot, "job-search"),
    path.join(roots.binRoot, "job-search-admin"),
  ];

  for (const launcherPath of launcherPaths) {
    await writeLauncher(launcherPath, roots);
  }

  return {
    ...roots,
    launcherPaths,
  };
}

export async function updateOperatorBundle(
  options: Partial<OperatorRoots> & { bundleRoot?: string } = {},
): Promise<InstallOperatorBundleResult> {
  const roots = resolveRoots(options);
  const bundleRoot =
    options.bundleRoot ?? path.join(getRepoRoot(), "dist", "operator-bundle");
  const previousRoot = `${roots.appRoot}.previous`;
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "job-search-operator-stage-"),
  );
  const stagedBundleRoot = path.join(stagingRoot, "bundle");

  await copyDirectory(bundleRoot, stagedBundleRoot);
  await fs.rm(previousRoot, { recursive: true, force: true });

  if (await pathExists(roots.appRoot)) {
    await fs.rename(roots.appRoot, previousRoot);
  }

  try {
    const result = await installOperatorBundle({
      ...roots,
      bundleRoot: stagedBundleRoot,
      allowReplace: true,
    });

    await migrateDatabase({
      dataRoot: roots.dataRoot,
      stateRoot: roots.stateRoot,
    });
    await replayDatabase({
      dataRoot: roots.dataRoot,
      stateRoot: roots.stateRoot,
    });

    return result;
  } catch (error) {
    await fs.rm(roots.appRoot, { recursive: true, force: true });
    if (await pathExists(previousRoot)) {
      await fs.rename(previousRoot, roots.appRoot);
    }
    throw error;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}
