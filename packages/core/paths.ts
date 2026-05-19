import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..", "..");

export type PathKind =
  | "dataRoot"
  | "config"
  | "memory"
  | "profile"
  | "strategy"
  | "events"
  | "applications"
  | "vacancies"
  | "evidence"
  | "inbox";

export type StatePathKind =
  | "stateRoot"
  | "audit"
  | "browserProfiles"
  | "health"
  | "controlPlane";

const KIND_SEGMENTS: Record<PathKind, readonly string[]> = {
  dataRoot: [],
  config: [],
  memory: ["memory"],
  profile: ["memory", "profile"],
  strategy: ["memory", "strategy"],
  events: ["memory", "events"],
  applications: ["memory", "applications"],
  vacancies: ["memory", "vacancies"],
  evidence: ["memory", "evidence"],
  inbox: ["inbox"]
};

const STATE_KIND_SEGMENTS: Record<StatePathKind, readonly string[]> = {
  stateRoot: [],
  audit: ["audit"],
  browserProfiles: ["browser-profiles"],
  health: ["health"],
  controlPlane: ["control-plane"]
};

function assertSafeSegment(segment: string): string {
  if (segment.length === 0) {
    throw new Error("Path segments must be non-empty.");
  }

  if (path.isAbsolute(segment)) {
    throw new Error(`Absolute path segments are not allowed: ${segment}`);
  }

  const normalized = segment.replace(/\\/g, "/");

  if (normalized === "." || normalized === "..") {
    throw new Error(`Traversal path segments are not allowed: ${segment}`);
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Unsafe path segment: ${segment}`);
  }

  return segment;
}

function resolveRootFromEnv(variableName: string): string | null {
  const configured = process.env[variableName]?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  return null;
}

function resolveXdgRoot(variableName: string, fallbackSegments: readonly string[]): string {
  const configured = process.env[variableName]?.trim();
  if (configured) {
    return path.resolve(configured, "job-search");
  }

  return path.join(os.homedir(), ...fallbackSegments, "job-search");
}

export function getAppRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_APP_ROOT") ?? path.join(os.homedir(), ".local", "opt", "job-search");
}

export function getConfigRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_CONFIG_DIR") ?? resolveXdgRoot("XDG_CONFIG_HOME", [".config"]);
}

export function getDataRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_DATA_DIR") ?? resolveXdgRoot("XDG_DATA_HOME", [".local", "share"]);
}

export function getStateRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_STATE_DIR") ?? resolveXdgRoot("XDG_STATE_HOME", [".local", "state"]);
}

export function getCacheRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_CACHE_DIR") ?? resolveXdgRoot("XDG_CACHE_HOME", [".cache"]);
}

export function getBinRoot(): string {
  return resolveRootFromEnv("JOB_SEARCH_BIN_DIR") ?? path.join(os.homedir(), ".local", "bin");
}

export function getUserDataRoot(): string {
  return getDataRoot();
}

export function getRepoRoot(): string {
  return repoRoot;
}

export function resolvePath(kind: PathKind, ...segments: string[]): string {
  const safeSegments = segments.map(assertSafeSegment);
  return path.join(getDataRoot(), ...KIND_SEGMENTS[kind], ...safeSegments);
}

export function resolveStatePath(kind: StatePathKind, ...segments: string[]): string {
  const safeSegments = segments.map(assertSafeSegment);
  return path.join(getStateRoot(), ...STATE_KIND_SEGMENTS[kind], ...safeSegments);
}
