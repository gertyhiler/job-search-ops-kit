/**
 * Open HH vacancy pages in a headed browser using the saved session.
 *
 * Usage:
 *   HEADLESS=0 pnpm exec tsx scripts/open-hh-vacancies.ts [url...]
 *   HEADLESS=0 pnpm exec tsx scripts/open-hh-vacancies.ts --high-value
 */
import { resolvePaths, loadEnv, hhPlaywrightProfileFromEnv } from "@job-search/core";
import { launchContext, isAuthenticated } from "@job-search/browser";

const args = process.argv.slice(2);
const highValueDefaults = [
  "https://hh.ru/vacancy/133684444",
  "https://hh.ru/vacancy/133512682",
];

const urls =
  args.length === 0 || args.includes("--high-value")
    ? highValueDefaults
    : args.filter((a) => a.startsWith("http"));

if (urls.length === 0) {
  console.error("Usage: open-hh-vacancies.ts [--high-value | url...]");
  process.exit(1);
}

const paths = resolvePaths();
const env = loadEnv();
const profile = hhPlaywrightProfileFromEnv(env);

const { browser, context } = await launchContext({
  storageStatePath: paths.storageStatePath,
  headless: process.env.HEADLESS !== "0",
  profile,
});

console.log("Storage:", paths.storageStatePath);
console.log("Headless:", process.env.HEADLESS !== "0");

for (const url of urls) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const auth = await isAuthenticated(page);
  console.log(`[${auth ? "ok" : "NOT LOGGED IN"}] ${url}`);
}

console.log("\nBrowser open — close the window when done.");
browser.on("disconnected", () => process.exit(0));
await new Promise<void>(() => {});
