import path from "node:path";
import type {
  ApplyErrorType,
  ApplyOutcome,
  QueueType,
} from "@job-search/contracts";
import { ensureDir } from "@job-search/core";
import type { Locator, Page } from "playwright";
import { closeQuietly, launchContext } from "./browser.ts";
import {
  detectAlreadyApplied,
  detectCaptcha,
  detectQuestionnaire,
  detectResumeChooser,
  detectSuccess,
  isAuthenticated,
} from "./failure-detection.ts";
import { HH } from "./selectors.ts";

export interface ApplyInput {
  url: string;
  vacancyId: number;
  coverLetter: string;
  mode: "dry_run" | "real";
  storageStatePath: string;
  screenshotsDir: string;
  tracesDir: string;
  headless?: boolean;
  timeoutMs?: number;
}

const ERROR_QUEUE: Record<ApplyErrorType, QueueType | null> = {
  already_applied: null,
  resume_required: "manual_review",
  cover_letter_field_missing: "manual_review",
  questionnaire_required: "questionnaire",
  auth_required: "auth_required",
  captcha_or_antibot: "captcha_or_antibot",
  selector_broken: "broken_selector",
  network_error: "broken_selector",
  unknown_error: "manual_review",
};

function fail(
  errorType: ApplyErrorType,
  message: string,
  artifacts: { screenshotPath: string | null; tracePath: string | null },
): ApplyOutcome {
  return {
    ok: false,
    status: errorType === "already_applied" ? "queued" : "failed",
    errorType,
    queueType: ERROR_QUEUE[errorType],
    message,
    screenshotPath: artifacts.screenshotPath,
    tracePath: artifacts.tracePath,
  };
}

async function clickFirst(
  page: Page,
  cssSelectors: string[],
  texts: string[],
  timeout = 4000,
): Promise<boolean> {
  for (const sel of cssSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout });
        return true;
      } catch {
        // try next
      }
    }
  }
  for (const text of texts) {
    const loc = page.getByRole("button", { name: text }).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout });
        return true;
      } catch {
        // try link variant
      }
    }
    const link = page.getByRole("link", { name: text }).first();
    if (await link.count().catch(() => 0)) {
      try {
        await link.click({ timeout });
        return true;
      } catch {
        // continue
      }
    }
  }
  return false;
}

async function findTextarea(page: Page): Promise<Locator | null> {
  for (const sel of HH.coverLetterTextarea) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) return loc;
  }
  return null;
}

export async function applyToVacancy(input: ApplyInput): Promise<ApplyOutcome> {
  const timeout = input.timeoutMs ?? 30_000;
  ensureDir(input.screenshotsDir);
  ensureDir(input.tracesDir);
  const stamp = `${input.vacancyId}-${Date.now()}`;
  const screenshotPath = path.join(input.screenshotsDir, `${stamp}.png`);
  const tracePath = path.join(input.tracesDir, `${stamp}.zip`);

  const { browser, context } = await launchContext({
    storageStatePath: input.storageStatePath,
    headless: input.headless ?? true,
  });

  let tracingStarted = false;
  let savedScreenshot: string | null = null;
  let savedTrace: string | null = null;

  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    tracingStarted = true;
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    try {
      await page.goto(input.url, { waitUntil: "domcontentloaded", timeout });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "navigation failed";
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail("network_error", message, {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }

    if (!(await isAuthenticated(page))) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail("auth_required", "Not authenticated. Run hh:login.", {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }

    if (await detectCaptcha(page)) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail(
        "captcha_or_antibot",
        "CAPTCHA / antibot detected. Stopping (never bypass).",
        {
          screenshotPath: savedScreenshot,
          tracePath: savedTrace,
        },
      );
    }

    if (await detectAlreadyApplied(page)) {
      return {
        ok: true,
        status: "queued",
        errorType: "already_applied",
        queueType: null,
        message: "Already applied.",
        screenshotPath: null,
        tracePath: null,
      };
    }

    const respondClicked = await clickFirst(
      page,
      HH.respondButton,
      HH.respondButtonText,
      6000,
    );
    if (!respondClicked) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail("selector_broken", "Respond button not found.", {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }

    await page.waitForTimeout(1500);

    if (await detectAlreadyApplied(page)) {
      return {
        ok: true,
        status: "queued",
        errorType: "already_applied",
        queueType: null,
        message: "Already applied.",
        screenshotPath: null,
        tracePath: null,
      };
    }
    if (await detectQuestionnaire(page)) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail(
        "questionnaire_required",
        "Questionnaire required; routed to questionnaire queue.",
        {
          screenshotPath: savedScreenshot,
          tracePath: savedTrace,
        },
      );
    }
    if (await detectResumeChooser(page)) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail(
        "resume_required",
        "Resume selection required; routed to manual review.",
        {
          screenshotPath: savedScreenshot,
          tracePath: savedTrace,
        },
      );
    }

    // Cover letter: open the field if collapsed, then fill it.
    let textarea = await findTextarea(page);
    if (!textarea) {
      await clickFirst(page, [], HH.coverLetterToggleText, 3000);
      await page.waitForTimeout(500);
      textarea = await findTextarea(page);
    }
    if (textarea && input.coverLetter.trim().length > 0) {
      try {
        await textarea.fill(input.coverLetter, { timeout });
      } catch {
        // non-fatal: some flows submit without a letter field
      }
    }

    if (input.mode === "dry_run") {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return {
        ok: true,
        status: "dry_run_ok",
        errorType: null,
        queueType: null,
        message: "Dry run reached submit step without submitting.",
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      };
    }

    const submitted = await clickFirst(
      page,
      HH.submitButton,
      HH.submitButtonText,
      6000,
    );
    if (!submitted) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail("selector_broken", "Submit control not found.", {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }

    await page.waitForTimeout(2000);
    if (await detectCaptcha(page)) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail("captcha_or_antibot", "CAPTCHA appeared at submit.", {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }
    if ((await detectSuccess(page)) || (await detectAlreadyApplied(page))) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return {
        ok: true,
        status: "applied",
        errorType: null,
        queueType: null,
        message: "Application submitted.",
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      };
    }

    ({ savedScreenshot, savedTrace } = await captureArtifacts(
      page,
      context,
      screenshotPath,
      tracePath,
      tracingStarted,
    ));
    return fail("unknown_error", "Submitted but could not confirm success.", {
      screenshotPath: savedScreenshot,
      tracePath: savedTrace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return fail("unknown_error", message, {
      screenshotPath: savedScreenshot,
      tracePath: savedTrace,
    });
  } finally {
    await closeQuietly(browser);
  }
}

async function captureArtifacts(
  page: Page,
  context: import("playwright").BrowserContext,
  screenshotPath: string,
  tracePath: string,
  tracingStarted: boolean,
): Promise<{ savedScreenshot: string | null; savedTrace: string | null }> {
  let savedScreenshot: string | null = null;
  let savedTrace: string | null = null;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    savedScreenshot = screenshotPath;
  } catch {
    // ignore
  }
  if (tracingStarted) {
    try {
      await context.tracing.stop({ path: tracePath });
      savedTrace = tracePath;
    } catch {
      // ignore
    }
  }
  return { savedScreenshot, savedTrace };
}
