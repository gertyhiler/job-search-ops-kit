import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  getAppRoot,
  getCacheRoot,
  getConfigRoot,
  getDataRoot,
  getStateRoot,
  getUserDataRoot,
  resolvePath,
  resolveStatePath
} from "../packages/core/paths.ts";

test("data/config/state/cache/app roots default to external XDG-style locations", () => {
  const previousData = process.env.JOB_SEARCH_DATA_DIR;
  const previousConfig = process.env.JOB_SEARCH_CONFIG_DIR;
  const previousState = process.env.JOB_SEARCH_STATE_DIR;
  const previousCache = process.env.JOB_SEARCH_CACHE_DIR;
  const previousApp = process.env.JOB_SEARCH_APP_ROOT;
  delete process.env.JOB_SEARCH_DATA_DIR;
  delete process.env.JOB_SEARCH_CONFIG_DIR;
  delete process.env.JOB_SEARCH_STATE_DIR;
  delete process.env.JOB_SEARCH_CACHE_DIR;
  delete process.env.JOB_SEARCH_APP_ROOT;

  try {
    assert.equal(getDataRoot(), path.join(process.env.HOME ?? "", ".local", "share", "job-search"));
    assert.equal(getConfigRoot(), path.join(process.env.HOME ?? "", ".config", "job-search"));
    assert.equal(getStateRoot(), path.join(process.env.HOME ?? "", ".local", "state", "job-search"));
    assert.equal(getCacheRoot(), path.join(process.env.HOME ?? "", ".cache", "job-search"));
    assert.equal(getAppRoot(), path.join(process.env.HOME ?? "", ".local", "opt", "job-search"));
    assert.equal(getUserDataRoot(), getDataRoot());
  } finally {
    process.env.JOB_SEARCH_DATA_DIR = previousData;
    process.env.JOB_SEARCH_CONFIG_DIR = previousConfig;
    process.env.JOB_SEARCH_STATE_DIR = previousState;
    process.env.JOB_SEARCH_CACHE_DIR = previousCache;
    process.env.JOB_SEARCH_APP_ROOT = previousApp;
  }
});

test("root helpers respect explicit environment overrides", () => {
  const previousData = process.env.JOB_SEARCH_DATA_DIR;
  const previousConfig = process.env.JOB_SEARCH_CONFIG_DIR;
  const previousState = process.env.JOB_SEARCH_STATE_DIR;
  const previousCache = process.env.JOB_SEARCH_CACHE_DIR;
  const previousApp = process.env.JOB_SEARCH_APP_ROOT;
  process.env.JOB_SEARCH_DATA_DIR = "/tmp/job-search-private";
  process.env.JOB_SEARCH_CONFIG_DIR = "/tmp/job-search-config";
  process.env.JOB_SEARCH_STATE_DIR = "/tmp/job-search-state";
  process.env.JOB_SEARCH_CACHE_DIR = "/tmp/job-search-cache";
  process.env.JOB_SEARCH_APP_ROOT = "/tmp/job-search-app";

  try {
    assert.equal(getUserDataRoot(), "/tmp/job-search-private");
    assert.equal(getConfigRoot(), "/tmp/job-search-config");
    assert.equal(getStateRoot(), "/tmp/job-search-state");
    assert.equal(getCacheRoot(), "/tmp/job-search-cache");
    assert.equal(getAppRoot(), "/tmp/job-search-app");
  } finally {
    process.env.JOB_SEARCH_DATA_DIR = previousData;
    process.env.JOB_SEARCH_CONFIG_DIR = previousConfig;
    process.env.JOB_SEARCH_STATE_DIR = previousState;
    process.env.JOB_SEARCH_CACHE_DIR = previousCache;
    process.env.JOB_SEARCH_APP_ROOT = previousApp;
  }
});

test("resolvePath and resolveStatePath return absolute paths for known path kinds", () => {
  const previous = process.env.JOB_SEARCH_DATA_DIR;
  const previousState = process.env.JOB_SEARCH_STATE_DIR;
  process.env.JOB_SEARCH_DATA_DIR = "/tmp/job-search-private";
  process.env.JOB_SEARCH_STATE_DIR = "/tmp/job-search-state";

  try {
    assert.equal(
      resolvePath("strategy", "active-strategy.yaml"),
      "/tmp/job-search-private/memory/strategy/active-strategy.yaml"
    );
    assert.equal(
      resolveStatePath("audit", "agent-runs.jsonl"),
      "/tmp/job-search-state/audit/agent-runs.jsonl"
    );
    assert.equal(
      resolveStatePath("controlPlane", "runs", "abc", "meta.json"),
      "/tmp/job-search-state/control-plane/runs/abc/meta.json"
    );
  } finally {
    process.env.JOB_SEARCH_DATA_DIR = previous;
    process.env.JOB_SEARCH_STATE_DIR = previousState;
  }
});

test("resolvePath rejects traversal and absolute segments", () => {
  assert.throws(() => resolvePath("memory", "../secret.txt"), /Unsafe path segment|Traversal path segments/);
  assert.throws(() => resolvePath("memory", "/tmp/secret.txt"), /Absolute path segments/);
  assert.throws(() => resolvePath("memory", ""), /non-empty/);
  assert.throws(() => resolveStatePath("audit", "../secret.txt"), /Unsafe path segment|Traversal path segments/);
});
