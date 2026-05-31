import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAutoApplyPolicy,
  loadSearchStrategy,
  loadVacancyScoring,
  STRATEGY_FILES,
} from "@job-search/core";

describe("fresh init strategy loading", () => {
  it("loads all strategy defaults when data/strategy is empty", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "jsok-init-"));
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmp;
    try {
      const repoRoot = path.resolve(import.meta.dirname, "..");
      const result = spawnSync(
        "pnpm",
        ["exec", "tsx", "apps/cli/bin.ts", "init"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: { ...process.env, DATA_DIR: tmp },
        },
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);

      for (const name of STRATEGY_FILES) {
        expect(existsSync(path.join(tmp, "strategy", `${name}.yaml`))).toBe(
          true,
        );
      }

      expect(loadSearchStrategy().queries.length).toBeGreaterThan(0);
      expect(loadAutoApplyPolicy().mode).toBe("dry_run");
      expect(loadVacancyScoring().routing.default).toBe("auto");
    } finally {
      process.env.DATA_DIR = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
