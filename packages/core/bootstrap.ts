import fs from "node:fs/promises";
import path from "node:path";
import { copyFileIfMissing, ensureDirectory, pathExists } from "./fs.ts";
import { stringifyJsonish } from "./json.ts";
import {
  getAppRoot,
  getConfigRoot,
  getDataRoot,
  getRepoRoot,
  getStateRoot,
} from "./paths.ts";

export interface RuntimeSettings {
  selected_runner_adapter: "codex-cli" | "cursor-cli";
  default_run_mode: "background" | "supervised" | "interactive_external";
  approvals_policy: "ask" | "auto-safe" | "manual-only";
  browser_supervision?: {
    prefer_supervised?: boolean;
    fallback_to_external?: boolean;
  };
}

export interface BootstrapResult {
  configRoot: string;
  dataRoot: string;
  stateRoot: string;
  createdConfigDirectories: string[];
  createdDataDirectories: string[];
  createdStateDirectories: string[];
  copiedDefaults: string[];
  runtimeSettingsPath: string;
  runtimeSettingsCreated: boolean;
  envFilePath: string;
  envFileCreated: boolean;
}

export interface OperatorWorkflowStatus {
  appRoot: string;
  configRoot: string;
  dataRoot: string;
  stateRoot: string;
  checks: {
    appRootExists: boolean;
    configRootExists: boolean;
    dataRootExists: boolean;
    stateRootExists: boolean;
    runtimeSettingsExists: boolean;
    privateEnvExists: boolean;
    codexMcpConfigExists: boolean;
    cursorMcpConfigExists: boolean;
    activeStrategyExists: boolean;
    profileSnapshotExists: boolean;
    masterResumeExists: boolean;
    browserProfilesRootExists: boolean;
    sqliteProjectionExists: boolean;
    sessionLogsRootExists: boolean;
  };
  onboarding: {
    ready: boolean;
    missing: string[];
  };
}

const CONFIG_DIRECTORIES = ["browser-recipes"] as const;

const DATA_DIRECTORIES = [
  "memory",
  "memory/onboarding",
  "memory/profile",
  "memory/strategy",
  "memory/strategy/change-proposals",
  "memory/vacancies",
  "memory/applications",
  "memory/resumes",
  "memory/resumes/variants",
  "memory/resumes/renders",
  "memory/events",
  "memory/journal",
  "memory/interviews",
  "memory/interviews/mock",
  "memory/session-logs",
  "memory/evidence",
  "memory/performance",
  "memory/reviews",
  "memory/dashboards",
  "inbox",
  "inbox/session-transcripts",
] as const;

const STATE_DIRECTORIES = [
  "audit",
  "browser-profiles",
  "health",
  "control-plane",
  "control-plane/runs",
] as const;

const DEFAULT_FILE_COPIES = [
  {
    source: path.join("config", "defaults", "escalation-rules.defaults.yaml"),
    target: "escalation-rules.yaml",
    root: "config",
  },
  {
    source: path.join(
      "config",
      "defaults",
      "browser-recipes",
      "_template.yaml",
    ),
    target: path.join("browser-recipes", "_template.yaml"),
    root: "config",
  },
  {
    source: path.join("config", "defaults", "resume-theme.defaults.yaml"),
    target: path.join("memory", "resumes", "theme-defaults.yaml"),
    root: "data",
  },
  {
    source: path.join("config", "defaults", "active-strategy.template.yaml"),
    target: path.join("memory", "strategy", "active-strategy.yaml"),
    root: "data",
  },
] as const;

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  selected_runner_adapter: "codex-cli",
  default_run_mode: "supervised",
  approvals_policy: "ask",
  browser_supervision: {
    prefer_supervised: true,
    fallback_to_external: true,
  },
};

async function ensureCanonicalTree(
  rootPath: string,
  directories: readonly string[],
): Promise<string[]> {
  const created: string[] = [];
  await ensureDirectory(rootPath);

  for (const relativePath of directories) {
    const absolutePath = path.join(rootPath, relativePath);
    const existed = await pathExists(absolutePath);
    await ensureDirectory(absolutePath);
    if (!existed) {
      created.push(relativePath);
    }
  }
  return created;
}

export async function ensureCanonicalConfigTree(
  configRoot = getConfigRoot(),
): Promise<string[]> {
  return ensureCanonicalTree(configRoot, CONFIG_DIRECTORIES);
}

export async function ensureCanonicalDataTree(
  dataRoot = getDataRoot(),
): Promise<string[]> {
  return ensureCanonicalTree(dataRoot, DATA_DIRECTORIES);
}

export async function ensureCanonicalStateTree(
  stateRoot = getStateRoot(),
): Promise<string[]> {
  return ensureCanonicalTree(stateRoot, STATE_DIRECTORIES);
}

export async function ensureCanonicalUserDataTree(
  userDataRoot = getDataRoot(),
): Promise<string[]> {
  return ensureCanonicalDataTree(userDataRoot);
}

export async function copyBootstrapDefaults(
  configRoot = getConfigRoot(),
  dataRoot = getDataRoot(),
): Promise<string[]> {
  const repoRoot = getRepoRoot();
  const copied: string[] = [];

  for (const fileMapping of DEFAULT_FILE_COPIES) {
    const sourcePath = path.join(repoRoot, fileMapping.source);
    const targetRoot = fileMapping.root === "config" ? configRoot : dataRoot;
    const targetPath = path.join(targetRoot, fileMapping.target);
    if (await copyFileIfMissing(sourcePath, targetPath)) {
      copied.push(
        path.join(fileMapping.root, fileMapping.target).replace(/\\/g, "/"),
      );
    }
  }

  return copied;
}

export async function scaffoldRuntimeSettings(
  configRoot = getConfigRoot(),
  overrides: Partial<RuntimeSettings> = {},
): Promise<{ path: string; created: boolean }> {
  const runtimeSettingsPath = path.join(configRoot, "runtime-settings.yaml");
  if (await pathExists(runtimeSettingsPath)) {
    return { path: runtimeSettingsPath, created: false };
  }

  await ensureDirectory(path.dirname(runtimeSettingsPath));
  const runtimeSettings: RuntimeSettings = {
    ...DEFAULT_RUNTIME_SETTINGS,
    ...overrides,
    browser_supervision: {
      ...DEFAULT_RUNTIME_SETTINGS.browser_supervision,
      ...overrides.browser_supervision,
    },
  };

  await fs.writeFile(
    runtimeSettingsPath,
    stringifyJsonish(runtimeSettings),
    "utf8",
  );
  return { path: runtimeSettingsPath, created: true };
}

export async function scaffoldPrivateEnv(
  configRoot = getConfigRoot(),
): Promise<{ path: string; created: boolean }> {
  const envPath = path.join(configRoot, ".env.local");
  if (await pathExists(envPath)) {
    return { path: envPath, created: false };
  }

  const repoRoot = getRepoRoot();
  const sourcePath = path.join(repoRoot, ".env.example");
  await ensureDirectory(path.dirname(envPath));
  await fs.copyFile(sourcePath, envPath);
  return { path: envPath, created: true };
}

export async function bootstrapUserDataFoundation(
  dataRoot = getDataRoot(),
  runtimeOverrides: Partial<RuntimeSettings> = {},
): Promise<BootstrapResult> {
  return bootstrapOperatorEnvironment({ dataRoot, runtimeOverrides });
}

export async function bootstrapOperatorEnvironment(
  options: {
    configRoot?: string;
    dataRoot?: string;
    stateRoot?: string;
    runtimeOverrides?: Partial<RuntimeSettings>;
  } = {},
): Promise<BootstrapResult> {
  const configRoot = options.configRoot ?? getConfigRoot();
  const dataRoot = options.dataRoot ?? getDataRoot();
  const stateRoot = options.stateRoot ?? getStateRoot();
  const createdConfigDirectories = await ensureCanonicalConfigTree(configRoot);
  const createdDataDirectories = await ensureCanonicalDataTree(dataRoot);
  const createdStateDirectories = await ensureCanonicalStateTree(stateRoot);
  const copiedDefaults = await copyBootstrapDefaults(configRoot, dataRoot);
  const runtimeSettings = await scaffoldRuntimeSettings(
    configRoot,
    options.runtimeOverrides ?? {},
  );
  const envFile = await scaffoldPrivateEnv(configRoot);

  return {
    configRoot,
    dataRoot,
    stateRoot,
    createdConfigDirectories,
    createdDataDirectories,
    createdStateDirectories,
    copiedDefaults,
    runtimeSettingsPath: runtimeSettings.path,
    runtimeSettingsCreated: runtimeSettings.created,
    envFilePath: envFile.path,
    envFileCreated: envFile.created,
  };
}

async function anyPathExists(paths: readonly string[]): Promise<boolean> {
  for (const filePath of paths) {
    if (await pathExists(filePath)) {
      return true;
    }
  }
  return false;
}

export async function getOperatorWorkflowStatus(
  options: {
    appRoot?: string;
    configRoot?: string;
    dataRoot?: string;
    stateRoot?: string;
  } = {},
): Promise<OperatorWorkflowStatus> {
  const appRoot = options.appRoot ?? getAppRoot();
  const configRoot = options.configRoot ?? getConfigRoot();
  const dataRoot = options.dataRoot ?? getDataRoot();
  const stateRoot = options.stateRoot ?? getStateRoot();

  const checks = {
    appRootExists: await pathExists(appRoot),
    configRootExists: await pathExists(configRoot),
    dataRootExists: await pathExists(dataRoot),
    stateRootExists: await pathExists(stateRoot),
    runtimeSettingsExists: await pathExists(
      path.join(configRoot, "runtime-settings.yaml"),
    ),
    privateEnvExists: await pathExists(path.join(configRoot, ".env.local")),
    codexMcpConfigExists: await pathExists(
      path.join(appRoot, ".codex", "config.toml"),
    ),
    cursorMcpConfigExists: await pathExists(
      path.join(appRoot, ".cursor", "mcp.json"),
    ),
    activeStrategyExists: await pathExists(
      path.join(dataRoot, "memory", "strategy", "active-strategy.yaml"),
    ),
    profileSnapshotExists: await pathExists(
      path.join(dataRoot, "memory", "profile", "profile.snapshot.json"),
    ),
    masterResumeExists: await anyPathExists([
      path.join(dataRoot, "memory", "profile", "master-resume.json"),
      path.join(dataRoot, "memory", "profile", "master-resume.md"),
      path.join(dataRoot, "memory", "resumes", "master-resume.json"),
      path.join(dataRoot, "memory", "resumes", "master-resume.md"),
    ]),
    browserProfilesRootExists: await pathExists(
      path.join(stateRoot, "browser-profiles"),
    ),
    sqliteProjectionExists: await pathExists(
      path.join(stateRoot, "job-search.db"),
    ),
    sessionLogsRootExists: await pathExists(
      path.join(dataRoot, "memory", "session-logs"),
    ),
  };

  const missing: string[] = [];
  if (!checks.activeStrategyExists) {
    missing.push("active strategy");
  }
  if (!checks.profileSnapshotExists) {
    missing.push("profile snapshot");
  }
  if (!checks.masterResumeExists) {
    missing.push("master resume");
  }

  return {
    appRoot,
    configRoot,
    dataRoot,
    stateRoot,
    checks,
    onboarding: {
      ready: missing.length === 0,
      missing,
    },
  };
}
