import fs from "node:fs/promises";
import path from "node:path";
import { parseJsonishFile, parseJsonLinesFile, readText } from "./lib/jsonish.mjs";
import { validateAgainstSchema } from "./lib/schema-validator.mjs";

const repoRoot = process.cwd();

const structuredChecks = [
  ["routing/model-policy.yaml", "schemas/model-routing-policy.schema.json", "json"],
  ["config/defaults/active-strategy.template.yaml", "schemas/strategy.schema.json", "json"],
  ["config/defaults/escalation-rules.defaults.yaml", "schemas/escalation-rules.schema.json", "json"],
  ["config/defaults/schedules.seed.yaml", "schemas/schedule-seed.schema.json", "json"],
  ["config/defaults/resume-theme.defaults.yaml", "schemas/resume-theme.schema.json", "json"],
  ["config/defaults/browser-recipes/_template.yaml", "schemas/browser-recipe.schema.json", "json"],
  ["examples/user-data-example/config/runtime-settings.yaml", "schemas/runtime-settings.schema.json", "json"],
  ["examples/user-data-example/config/model-policy.overrides.yaml", "schemas/model-policy-overrides.schema.json", "json"],
  ["examples/user-data-example/memory/profile/profile.snapshot.json", "schemas/profile.schema.json", "json"],
  ["examples/user-data-example/memory/strategy/active-strategy.yaml", "schemas/strategy.schema.json", "json"],
  ["examples/user-data-example/memory/strategy/change-proposals/proposal-001.yaml", "schemas/strategy-change-proposal.schema.json", "json"],
  ["examples/user-data-example/memory/vacancies/vacancy-acme-platform-engineer.json", "schemas/vacancy.schema.json", "json"],
  ["examples/user-data-example/memory/applications/app-acme-platform-engineer/application.json", "schemas/application.schema.json", "json"],
  ["examples/user-data-example/memory/applications/app-acme-platform-engineer/cover-letter.json", "schemas/cover-letter.schema.json", "json"],
  ["examples/user-data-example/memory/applications/app-acme-platform-engineer/interview.json", "schemas/interview.schema.json", "json"],
  ["examples/user-data-example/memory/resumes/variants/backend-focus.json", "schemas/resume-version.schema.json", "json"],
  ["examples/user-data-example/memory/events/application-events.jsonl", "schemas/application-event.schema.json", "jsonl"]
];

const narrativeRequired = [
  "examples/user-data-example/brief.md",
  "examples/user-data-example/memory/profile/candidate.md",
  "examples/user-data-example/memory/profile/constraints.md",
  "examples/user-data-example/memory/profile/preferences.md",
  "examples/user-data-example/memory/profile/master-resume.json",
  "examples/user-data-example/memory/dashboards/today-context.md"
];

const docFiles = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/current-status.md",
  "docs/functional-spec.md",
  "docs/architecture.md",
  "docs/getting-started.md",
  "docs/privacy.md",
  "docs/implementation-roadmap.md"
];

const forbiddenStrings = [
  "user-data/config/active-strategy.yaml",
  "active-strategy.v0.yaml",
  "packages/cli/scripts/guard-commit.ts",
  "The repository is in M1 shape",
  "default `./user-data`",
  "runtime work starts in milestone 3"
];

async function loadSchema(relativePath) {
  return parseJsonishFile(path.join(repoRoot, relativePath));
}

async function validateStructuredFiles() {
  const issues = [];

  for (const [dataPath, schemaPath, kind] of structuredChecks) {
    const schema = await loadSchema(schemaPath);
    const absoluteDataPath = path.join(repoRoot, dataPath);
    const values = kind === "jsonl"
      ? await parseJsonLinesFile(absoluteDataPath)
      : [await parseJsonishFile(absoluteDataPath)];

    values.forEach((value, index) => {
      const errors = validateAgainstSchema(schema, value);
      if (errors.length > 0) {
        const suffix = kind === "jsonl" ? ` line ${index + 1}` : "";
        issues.push(`${dataPath}${suffix}: ${errors.join("; ")}`);
      }
    });
  }

  return issues;
}

async function validateNarrativePresence() {
  const issues = [];
  for (const relativePath of narrativeRequired) {
    try {
      const stats = await fs.stat(path.join(repoRoot, relativePath));
      if (!stats.isFile()) {
        issues.push(`${relativePath}: expected a file`);
      }
    } catch {
      issues.push(`${relativePath}: missing`);
    }
  }
  return issues;
}

async function validateDocs() {
  const issues = [];
  const contents = await Promise.all(
    docFiles.map(async (relativePath) => [relativePath, await readText(path.join(repoRoot, relativePath))])
  );

  for (const [relativePath, content] of contents) {
    if (relativePath === "docs/current-status.md") {
      continue;
    }

    for (const needle of forbiddenStrings) {
      if (content.includes(needle)) {
        issues.push(`${relativePath}: forbidden stale reference "${needle}"`);
      }
    }
  }

  const readme = contents.find(([relativePath]) => relativePath === "README.md")?.[1] ?? "";
  const docsIndex = contents.find(([relativePath]) => relativePath === "docs/README.md")?.[1] ?? "";
  const currentStatus = contents.find(([relativePath]) => relativePath === "docs/current-status.md")?.[1] ?? "";

  if (!readme.includes("~/.local/opt/job-search")) {
    issues.push('README.md: must mention the installed app root "~/.local/opt/job-search"');
  }
  if (!readme.includes("docs/current-status.md")) {
    issues.push('README.md: must link to "docs/current-status.md"');
  }
  if (!docsIndex.includes("current-status.md")) {
    issues.push('docs/README.md: must link to "current-status.md"');
  }
  if (!currentStatus.includes("~/.local/share/job-search")) {
    issues.push('docs/current-status.md: must mention the external data root "~/.local/share/job-search"');
  }

  const agents = contents.find(([relativePath]) => relativePath === "AGENTS.md")?.[1] ?? "";
  if (!agents.toLowerCase().includes("developer workspace")) {
    issues.push('AGENTS.md: must describe this repo as the developer workspace');
  }

  return issues;
}

async function validateSkillSplit() {
  const issues = [];
  const repoSkills = await fs.readdir(path.join(repoRoot, ".agents", "skills"), { withFileTypes: true });
  for (const entry of repoSkills) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(repoRoot, ".agents", "skills", entry.name, "SKILL.md");
    try {
      const stats = await fs.stat(skillPath);
      if (stats.isFile()) {
        issues.push(".agents/skills: production role skills must not remain in the root developer workspace");
        break;
      }
    } catch {
      // Empty directories are tolerated in this workspace because `.agents` can be permission-restricted.
    }
  }

  const operatorSkills = await fs.readdir(path.join(repoRoot, "operator", ".agents", "skills"), { withFileTypes: true });
  if (operatorSkills.filter((entry) => entry.isDirectory()).length < 10) {
    issues.push("operator/.agents/skills: expected the full production role skill set");
  }

  return issues;
}

async function main() {
  const issues = [
    ...(await validateStructuredFiles()),
    ...(await validateNarrativePresence()),
    ...(await validateDocs()),
    ...(await validateSkillSplit())
  ];

  if (issues.length > 0) {
    console.error("Foundation validation failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Foundation validation passed.");
}

await main();
