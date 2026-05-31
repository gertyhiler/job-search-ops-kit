/**
 * Playbook smoke test — DRY RUN ONLY (never submits to HH).
 *
 * Usage: pnpm exec tsx scripts/test-hh-apply.ts <url> [vacancyId]
 */
process.env.JOB_SEARCH_PLAYWRIGHT_DEBUG = "1";

import { resolvePaths, hhPlaywrightProfileFromEnv, loadEnv } from "@job-search/core";
import { applyToVacancy } from "@job-search/browser";

const url = process.argv[2];
if (!url) {
  console.error("Usage: test-hh-apply.ts <url> [vacancyId]");
  process.exit(1);
}
const vacancyId = Number(process.argv[3] ?? "99999");
const paths = resolvePaths();
const env = loadEnv();

const outcome = await applyToVacancy({
  url,
  vacancyId,
  coverLetter: "[debug dry-run] playbook smoke test — not sent.",
  mode: "dry_run",
  allowRealSubmit: false,
  storageStatePath: paths.storageStatePath,
  screenshotsDir: paths.screenshotsDir,
  tracesDir: paths.tracesDir,
  headless: process.env.HEADLESS !== "0",
  profile: hhPlaywrightProfileFromEnv(env),
});

console.log(JSON.stringify(outcome, null, 2));
