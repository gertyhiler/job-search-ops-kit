import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadPrompt,
  resolvePaths,
} from "@job-search/core";

describe("loadPrompt", () => {
  it("loads from data/prompts override when present", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "jsok-prompt-"));
    const dataDir = path.join(tmp, "data");
    mkdirSync(path.join(dataDir, "prompts"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "prompts", "cover-letter.md"),
      "Hello {{name}}",
      "utf8",
    );

    const repoRoot = path.resolve(import.meta.dirname, "..");
    const paths = resolvePaths({ dataDir, repoRoot });
    const prompt = loadPrompt("cover-letter", { name: "World" }, paths);
    expect(prompt).toBe("Hello World");
    rmSync(tmp, { recursive: true, force: true });
  });
});
