import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractProfilePromptSections,
  loadPrompt,
  profilePromptAdditionsFor,
  resolvePaths,
} from "@job-search/core";

describe("profile prompt additions", () => {
  it("parses ## sections case-insensitively", () => {
    const md = `# Title

## all
Always honest.

## cover-letter
Keep it short.

## Agent
Chat only.
`;
    const sections = extractProfilePromptSections(md);
    expect(sections.get("all")).toBe("Always honest.");
    expect(sections.get("cover-letter")).toBe("Keep it short.");
    expect(sections.get("agent")).toBe("Chat only.");
  });

  it("merges all + named section into loadPrompt output", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "jsok-prompt-"));
    const dataDir = path.join(tmp, "data");
    const profileDir = path.join(dataDir, "profile");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      path.join(profileDir, "prompt-additions.md"),
      `## all
Global rule.

## cover-letter
Letter rule.
`,
      "utf8",
    );
    const repoRoot = path.resolve(import.meta.dirname, "..");
    const paths = resolvePaths({ dataDir, repoRoot });
    const additions = profilePromptAdditionsFor("cover-letter", paths);
    expect(additions).toContain("Global rule.");
    expect(additions).toContain("Letter rule.");

    const prompt = loadPrompt("cover-letter", {
      role: "Dev",
      company: "Co",
      candidate_name: "Test",
      template: "Hi",
      facts: "FACT: one",
    }, paths);
    expect(prompt).toContain("CANDIDATE-SPECIFIC");
    expect(prompt).toContain("Letter rule.");
    rmSync(tmp, { recursive: true, force: true });
  });
});
