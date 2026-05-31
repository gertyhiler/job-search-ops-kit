import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  copyIfMissing,
  ensureDir,
  loadEnv,
  resolvePaths,
} from "@job-search/core";
import { openAndMigrate } from "@job-search/db";

export function runInit(): void {
  const env = loadEnv();
  const p = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });

  const dirs = [
    p.dataDir,
    path.dirname(p.dbPath),
    p.profileDir,
    p.strategyDir,
    p.templatesDir,
    path.join(p.dataDir, "prompts"),
    p.resumeDir,
    p.resumeVariantsDir,
    p.journalDir,
    p.inboxDir,
    p.insightsDir,
    p.healthDir,
    p.screenshotsDir,
    p.tracesDir,
    p.reportsDir,
    p.resumeRendersDir,
  ];
  for (const d of dirs) ensureDir(d);

  let copied = 0;
  const copy = (src: string, dest: string): void => {
    if (existsSync(src) && copyIfMissing(src, dest)) copied += 1;
  };

  // Profile markdown
  const profileDefaults = path.join(p.configDefaultsDir, "profile");
  if (existsSync(profileDefaults)) {
    for (const file of readdirSync(profileDefaults)) {
      if (!file.endsWith(".template.md")) continue;
      const name = file.replace(".template.md", ".md");
      copy(path.join(profileDefaults, file), path.join(p.profileDir, name));
    }
  }

  // Strategy YAML
  for (const name of [
    "search-strategy",
    "auto-apply-policy",
    "manual-review-policy",
    "blacklist",
    "target-companies",
    "vacancy-gates",
  ]) {
    copy(
      path.join(p.configDefaultsDir, `${name}.template.yaml`),
      path.join(p.strategyDir, `${name}.yaml`),
    );
  }

  // Resume theme + master resume
  copy(
    path.join(p.configDefaultsDir, "resume-theme.template.yaml"),
    path.join(p.resumeDir, "resume-theme.yaml"),
  );
  copy(
    path.join(p.configDefaultsDir, "master-resume.template.json"),
    path.join(p.resumeDir, "master-resume.json"),
  );

  // Cover letter templates
  const templatesDefaults = path.join(p.configDefaultsDir, "templates");
  if (existsSync(templatesDefaults)) {
    for (const file of readdirSync(templatesDefaults)) {
      if (!file.endsWith(".md")) continue;
      copy(path.join(templatesDefaults, file), path.join(p.templatesDir, file));
    }
  }

  // Classification prompt (data/prompts overrides repo prompts/)
  copy(
    path.join(p.configDefaultsDir, "prompts", "vacancy-scoring.template.md"),
    path.join(p.dataDir, "prompts", "vacancy-scoring.md"),
  );

  // Database
  const db = openAndMigrate(p.dbPath);
  db.close();

  console.log("Initialized job-search data tree.");
  console.log(`  data dir: ${p.dataDir}`);
  console.log(`  database: ${p.dbPath}`);
  console.log(`  files seeded: ${copied}`);
  console.log("");
  console.log("Next steps:");
  console.log(
    "  1. In your IDE/CLI chat, run the /init skill and paste your resume.",
  );
  console.log("  2. job-search hh:login   (save your HH browser session)");
  console.log("  3. job-search doctor     (verify the environment)");
  console.log(
    "  4. pnpm dev              (start the pipeline, dry-run by default)",
  );
}
