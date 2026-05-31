/**
 * Interactive HH apply flow debugger — DRY RUN ONLY (never submits).
 *
 * Usage: pnpm exec tsx scripts/debug-hh-apply.ts [vacancy-url]
 * Visible browser: HEADLESS=0 pnpm exec tsx scripts/debug-hh-apply.ts [url]
 */
process.env.JOB_SEARCH_PLAYWRIGHT_DEBUG = "1";

import { resolvePaths } from "@job-search/core";
import {
  HH,
  launchContext,
  closeQuietly,
  detectAlreadyApplied,
  detectCaptcha,
  detectQuestionnaire,
  detectResumeChooser,
  detectSuccess,
  isAuthenticated,
} from "@job-search/browser";
import type { Page } from "playwright";

const url =
  process.argv[2] ?? "https://hh.ru/vacancy/133684444";

const paths = resolvePaths();

async function bodySnippet(page: Page, max = 800): Promise<string> {
  try {
    const text = (await page.locator("body").innerText({ timeout: 5000 }))
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, max);
  } catch {
    return "(no body text)";
  }
}

async function visibleButtons(page: Page): Promise<string[]> {
  const buttons = page.locator("button, [role='button'], a[data-qa*='response']");
  const count = Math.min(await buttons.count(), 20);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (await buttons.nth(i).innerText().catch(() => "")).trim();
    if (t) names.push(t.replace(/\s+/g, " ").slice(0, 60));
  }
  return [...new Set(names)];
}

async function detectCrossCountry(page: Page): Promise<boolean> {
  const text = await bodySnippet(page, 2000);
  return text.toLowerCase().includes("другой стран");
}

async function clickFirst(
  page: Page,
  cssSelectors: string[],
  texts: string[],
  label: string,
): Promise<boolean> {
  for (const sel of cssSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      console.log(`  click css: ${sel}`);
      await loc.click({ timeout: 6000 });
      return true;
    }
  }
  for (const text of texts) {
    for (const role of ["button", "link"] as const) {
      const loc = page.getByRole(role, { name: text }).first();
      if (await loc.count().catch(() => 0)) {
        console.log(`  click ${role}: "${text}"`);
        await loc.click({ timeout: 6000 });
        return true;
      }
    }
  }
  console.log(`  FAILED: ${label}`);
  return false;
}

async function dumpOverlays(page: Page): Promise<void> {
  const overlays = page.locator(
    '[class*="overlay"], [role="dialog"], [data-qa*="modal"], [data-qa*="popup"]',
  );
  const n = await overlays.count();
  console.log(`  overlays: ${n}`);
  for (let i = 0; i < Math.min(n, 5); i++) {
    const loc = overlays.nth(i);
    const vis = await loc.isVisible().catch(() => false);
    const t = (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (vis && t) console.log(`    [${i}] ${t.slice(0, 300)}`);
  }
}

async function step(name: string, page: Page): Promise<void> {
  console.log(`\n=== ${name} ===`);
  console.log("  url:", page.url());
  console.log("  auth:", await isAuthenticated(page));
  console.log("  alreadyApplied:", await detectAlreadyApplied(page));
  console.log("  resumeChooser:", await detectResumeChooser(page));
  console.log("  questionnaire:", await detectQuestionnaire(page));
  console.log("  crossCountry:", await detectCrossCountry(page));
  console.log("  success:", await detectSuccess(page));
  console.log("  captcha:", await detectCaptcha(page));
  await dumpOverlays(page);
  console.log("  buttons:", (await visibleButtons(page)).join(" | "));
  console.log("  body:", await bodySnippet(page));
}

const { browser, context } = await launchContext({
  storageStatePath: paths.storageStatePath,
  headless: process.env.HEADLESS !== "0",
});

const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  console.log("DRY RUN ONLY — this script never submits an application.");
  console.log("Storage:", paths.storageStatePath);
  console.log("Vacancy:", url);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await step("1. vacancy page", page);

  if (!(await isAuthenticated(page))) {
    console.error("\nNot authenticated — run: pnpm job-search hh:login");
    process.exitCode = 1;
  } else {
    await clickFirst(page, HH.respondButton, HH.respondButtonText, "respond");
    await page.waitForTimeout(1500);
    await step("2. after respond click", page);

    const overlayText = await page
      .locator('[class*="overlay"]:visible, [role="dialog"]:visible')
      .first()
      .innerText()
      .catch(() => "");
    if (
      (await detectCrossCountry(page)) ||
      overlayText.toLowerCase().includes("другой стран")
    ) {
      console.log("\n>>> Cross-country modal");
      await clickFirst(
        page,
        [],
        ["Все равно откликнуться", "Всё равно откликнуться", "Продолжить"],
        "cross-country confirm",
      );
      await page.waitForTimeout(1500);
      await step("3. after cross-country confirm", page);
    }

    if (await detectResumeChooser(page)) {
      console.log("\n>>> Resume chooser detected (would pick first in playbook)");
    }

    if (await detectQuestionnaire(page)) {
      console.log("\n>>> Questionnaire detected — stopping");
    } else {
      await clickFirst(page, [], HH.coverLetterToggleText, "cover toggle");
      await page.waitForTimeout(500);

      const textarea = page.locator(HH.coverLetterTextarea.join(", ")).first();
      if (await textarea.count()) {
        await textarea.fill("[debug dry-run] playbook inspection — not sent.");
        console.log("\n>>> Cover letter filled (test text, not submitted)");
      }

      await step("4. ready to submit (stopped here)", page);
      console.log(
        "\nStopped before submit. Real applies only via pipeline after your confirmation.",
      );
    }
  }

  const shot = `${paths.screenshotsDir}/debug-${Date.now()}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log("\nScreenshot:", shot);
} finally {
  await closeQuietly(browser);
}
