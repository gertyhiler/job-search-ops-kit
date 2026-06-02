import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import type { NormalizedVacancy } from "@job-search/contracts";
import {
  clearCoverTemplateCache,
  loadCoverTemplates,
  parseCoverTemplateFile,
  pickCoverTemplate,
  scoreCoverTemplate,
} from "@job-search/core";

function vacancy(partial: Partial<NormalizedVacancy> = {}): NormalizedVacancy {
  return {
    source: "hh",
    externalId: "1",
    url: "https://hh.ru/vacancy/1",
    title: "Frontend Developer",
    description: "",
    companyName: "",
    companyExternalId: null,
    keySkills: [],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryGross: null,
    location: null,
    remoteType: "unknown",
    schedule: null,
    employment: null,
    experience: null,
    publishedAt: "2026-01-01T00:00:00Z",
    raw: {},
    ...partial,
  };
}

const MINIMAL_TEMPLATE = `---
id: test-template
priority: 50
fallback: false
select:
  keywords:
    - { term: backoffice, weight: 3 }
---
Hello {{role}}
`;

const FALLBACK_TEMPLATE = `---
id: generic
priority: 0
fallback: true
---
Fallback {{role}}
`;

function writeTemplate(dir: string, name: string, content: string): void {
  writeFileSync(path.join(dir, name), content, "utf8");
}

describe("parseCoverTemplateFile", () => {
  it("parses YAML frontmatter and body", () => {
    const parsed = parseCoverTemplateFile(MINIMAL_TEMPLATE, "cover-test.md");
    expect(parsed.meta.id).toBe("test-template");
    expect(parsed.meta.priority).toBe(50);
    expect(parsed.body).toBe("Hello {{role}}");
  });

  it("throws when frontmatter is missing", () => {
    expect(() =>
      parseCoverTemplateFile("No frontmatter here", "cover-bad.md"),
    ).toThrow(/missing YAML frontmatter/);
  });
});

describe("pickCoverTemplate", () => {
  let tmpDir: string;

  beforeEach(() => {
    clearCoverTemplateCache();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "jsok-cover-tpl-"));
    mkdirSync(tmpDir, { recursive: true });
  });

  it("picks template by keyword score", () => {
    writeTemplate(tmpDir, "cover-specific.md", MINIMAL_TEMPLATE);
    writeTemplate(tmpDir, "cover-generic.md", FALLBACK_TEMPLATE);

    const templates = loadCoverTemplates(tmpDir);
    const picked = pickCoverTemplate(
      vacancy({
        title: "Backoffice React Developer",
        description: "Internal tools platform",
      }),
      templates,
    );

    expect(picked.meta.id).toBe("test-template");
    expect(picked.score).toBeGreaterThan(0);
  });

  it("uses fallback when no keywords match", () => {
    writeTemplate(tmpDir, "cover-specific.md", MINIMAL_TEMPLATE);
    writeTemplate(tmpDir, "cover-generic.md", FALLBACK_TEMPLATE);

    const templates = loadCoverTemplates(tmpDir);
    const picked = pickCoverTemplate(
      vacancy({ title: "Random unrelated role" }),
      templates,
    );

    expect(picked.meta.id).toBe("generic");
    expect(picked.score).toBe(0);
  });

  it("breaks ties by priority", () => {
    writeTemplate(
      tmpDir,
      "cover-low.md",
      MINIMAL_TEMPLATE.replace("priority: 50", "priority: 10").replace(
        "test-template",
        "low",
      ),
    );
    writeTemplate(
      tmpDir,
      "cover-high.md",
      MINIMAL_TEMPLATE.replace("priority: 50", "priority: 90").replace(
        "test-template",
        "high",
      ),
    );
    writeTemplate(tmpDir, "cover-generic.md", FALLBACK_TEMPLATE);

    const templates = loadCoverTemplates(tmpDir);
    const picked = pickCoverTemplate(
      vacancy({ title: "Backoffice engineer" }),
      templates,
    );

    expect(picked.meta.id).toBe("high");
  });

  it("adds use-case bonus to score", () => {
    const withUc = `---
id: uc-template
priority: 50
select:
  keywords:
    - { term: react, weight: 1 }
  useCases:
    ids: [UC-01]
    weight: 5
---
Body
`;
    writeTemplate(tmpDir, "cover-uc.md", withUc);
    writeTemplate(tmpDir, "cover-generic.md", FALLBACK_TEMPLATE);

    const templates = loadCoverTemplates(tmpDir);
    const meta = templates.find((t) => t.meta.id === "uc-template")!.meta;
    const without = scoreCoverTemplate(
      meta,
      vacancy({ title: "React dev" }),
      [],
    );
    const withIds = scoreCoverTemplate(meta, vacancy({ title: "React dev" }), [
      "UC-01",
    ]);
    expect(withIds).toBeGreaterThan(without);
  });
});

describe("default cover templates", () => {
  beforeEach(() => clearCoverTemplateCache());

  it("loads repo templates with frontmatter", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..");
    const templatesDir = path.join(repoRoot, "config/defaults/templates");
    const templates = loadCoverTemplates(templatesDir);
    expect(templates.length).toBeGreaterThanOrEqual(10);
    expect(templates.some((t) => t.meta.fallback)).toBe(true);
  });

  it("routes backoffice vacancy to platform-admin", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..");
    const templates = loadCoverTemplates(
      path.join(repoRoot, "config/defaults/templates"),
    );
    const picked = pickCoverTemplate(
      vacancy({
        title: "Frontend Backoffice Developer",
        keySkills: ["React", "TypeScript"],
      }),
      templates,
    );
    expect(picked.meta.id).toBe("platform-admin");
  });
});

describe("compactVacancyText", () => {
  it("truncates long descriptions", async () => {
    const { compactVacancyText } = await import("@job-search/service");
    const long = "x".repeat(2000);
    const text = compactVacancyText(
      vacancy({ title: "Dev", description: long, keySkills: ["React"] }),
      100,
    );
    expect(text).toContain("Dev");
    expect(text).toContain("React");
    expect(text.length).toBeLessThan(long.length);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("generateCoverLetter routing", () => {
  it("uses template-only path for auto apply mode without AI", async () => {
    const { generateCoverLetter } = await import("@job-search/service");
    const tmp = mkdtempSync(path.join(os.tmpdir(), "jsok-cover-gen-"));
    const dataDir = path.join(tmp, "data");
    const templatesDir = path.join(dataDir, "templates");
    const profileDir = path.join(dataDir, "profile");
    const resumeDir = path.join(dataDir, "resume");
    mkdirSync(templatesDir, { recursive: true });
    mkdirSync(profileDir, { recursive: true });
    mkdirSync(resumeDir, { recursive: true });

    const repoRoot = path.resolve(import.meta.dirname, "..");
    for (const file of ["cover-generic.md", "cover-react-product.md"]) {
      writeFileSync(
        path.join(templatesDir, file),
        readFileSync(
          path.join(repoRoot, "config/defaults/templates", file),
          "utf8",
        ),
      );
    }

    writeFileSync(
      path.join(profileDir, "user-profile.md"),
      "# Profile\n\nReact dev.",
      "utf8",
    );
    writeFileSync(
      path.join(profileDir, "use-cases.md"),
      `## UC-01: Test case

When relevant:
- react

Bullets:
- Built React apps.
`,
      "utf8",
    );

    clearCoverTemplateCache();
    const { resolvePaths, loadEnv } = await import("@job-search/core");
    const paths = resolvePaths({ dataDir });
    const env = { ...loadEnv(), COVER_LETTER_MODE: "route" as const };

    const result = await generateCoverLetter(
      { env, paths },
      vacancy({ title: "React Developer", keySkills: ["React"] }),
      { applyMode: "auto", persistLog: false },
    );

    expect(result.usedAi).toBe(false);
    expect(result.text).toContain("React Developer");
    rmSync(tmp, { recursive: true, force: true });
  });
});
