import path from "node:path";
import type {
  ApplyErrorType,
  ApplyOutcome,
  QueueType,
} from "@job-search/contracts";
import { ensureDir, type PlaywrightProfile } from "@job-search/core";
import type { Locator, Page } from "playwright";
import { closeQuietly, launchContext } from "./browser.ts";
import {
  detectAlreadyApplied,
  detectAuthWall,
  detectCaptcha,
  detectQuestionnaire,
  detectResumeChooser,
  detectSuccess,
  isAuthenticated,
} from "./failure-detection.ts";
import {
  dismissCrossCountryModal,
  responsePopup,
  selectResumeInPopup,
  submitRoots,
  waitForResponsePopup,
} from "./hh-modals.ts";
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
  profile?: PlaywrightProfile;
  /** When false, real submit is refused (debug / manual inspection). Default true. */
  allowRealSubmit?: boolean;
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

async function clickFirstIn(
  root: Page | Locator,
  cssSelectors: string[],
  texts: string[],
  timeout = 4000,
): Promise<boolean> {
  for (const sel of cssSelectors) {
    const loc = root.locator(sel).first();
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
    const btn = root.getByRole("button", { name: text }).first();
    if (await btn.count().catch(() => 0)) {
      try {
        await btn.click({ timeout });
        return true;
      } catch {
        // try link variant
      }
    }
    const link = root.getByRole("link", { name: text }).first();
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

async function clickFirst(
  page: Page,
  cssSelectors: string[],
  texts: string[],
  timeout = 4000,
): Promise<boolean> {
  return clickFirstIn(page, cssSelectors, texts, timeout);
}

async function findTextarea(page: Page): Promise<Locator | null> {
  const popup = responsePopup(page);
  for (const sel of HH.coverLetterTextarea) {
    const loc = popup.locator(sel).first();
    if (await loc.count().catch(() => 0)) return loc;
  }
  for (const sel of HH.coverLetterTextarea) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) return loc;
  }
  return null;
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

async function clickSubmit(page: Page, timeout = 6000): Promise<boolean> {
  const { popup, dialog } = submitRoots(page);
  if (
    await clickFirstIn(popup, HH.submitButton, HH.submitButtonText, timeout)
  ) {
    return true;
  }
  if (
    await clickFirstIn(dialog, HH.submitButton, HH.submitButtonText, timeout)
  ) {
    return true;
  }
  return clickFirst(page, HH.submitButton, HH.submitButtonText, timeout);
}

async function classifySubmitBlock(
  page: Page,
): Promise<"captcha_or_antibot" | "already_applied" | "success" | null> {
  if (await detectCaptcha(page)) return "captcha_or_antibot";
  if (await detectAlreadyApplied(page)) return "already_applied";
  if (await detectSuccess(page)) return "success";
  return null;
}

async function captureAndFail(
  page: Page,
  context: import("playwright").BrowserContext,
  screenshotPath: string,
  tracePath: string,
  tracingStarted: boolean,
  errorType: ApplyErrorType,
  message: string,
): Promise<ApplyOutcome> {
  const { savedScreenshot, savedTrace } = await captureArtifacts(
    page,
    context,
    screenshotPath,
    tracePath,
    tracingStarted,
  );
  return fail(errorType, message, {
    screenshotPath: savedScreenshot,
    tracePath: savedTrace,
  });
}

async function captureAndSuccess(
  page: Page,
  context: import("playwright").BrowserContext,
  screenshotPath: string,
  tracePath: string,
  tracingStarted: boolean,
  message: string,
): Promise<ApplyOutcome> {
  const { savedScreenshot, savedTrace } = await captureArtifacts(
    page,
    context,
    screenshotPath,
    tracePath,
    tracingStarted,
  );
  return {
    ok: true,
    status: "applied",
    errorType: null,
    queueType: null,
    message,
    screenshotPath: savedScreenshot,
    tracePath: savedTrace,
  };
}

export async function applyToVacancy(input: ApplyInput): Promise<ApplyOutcome> {
  const timeout = input.timeoutMs ?? 30_000;
  const allowReal =
    input.allowRealSubmit !== false &&
    process.env.JOB_SEARCH_PLAYWRIGHT_DEBUG !== "1";
  if (input.mode === "real" && !allowReal) {
    return fail(
      "unknown_error",
      "Real submit blocked (debug script or allowRealSubmit=false).",
      {
        screenshotPath: null,
        tracePath: null,
      },
    );
  }
  ensureDir(input.screenshotsDir);
  ensureDir(input.tracesDir);
  const stamp = `${input.vacancyId}-${Date.now()}`;
  const screenshotPath = path.join(input.screenshotsDir, `${stamp}.png`);
  const tracePath = path.join(input.tracesDir, `${stamp}.zip`);

  const { browser, context } = await launchContext({
    storageStatePath: input.storageStatePath,
    headless: input.headless ?? true,
    profile: input.profile,
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

    if (await detectAuthWall(page)) {
      ({ savedScreenshot, savedTrace } = await captureArtifacts(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
      ));
      return fail(
        "auth_required",
        "Vacancy access denied or auth wall on HH.",
        {
          screenshotPath: savedScreenshot,
          tracePath: savedTrace,
        },
      );
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
      if (await detectAuthWall(page)) {
        return fail(
          "auth_required",
          "Respond button missing due to auth wall on vacancy page.",
          {
            screenshotPath: savedScreenshot,
            tracePath: savedTrace,
          },
        );
      }
      return fail("selector_broken", "Respond button not found.", {
        screenshotPath: savedScreenshot,
        tracePath: savedTrace,
      });
    }

    await page.waitForTimeout(1500);

    await dismissCrossCountryModal(page);
    await waitForResponsePopup(page);

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
      await selectResumeInPopup(page);
      await page.waitForTimeout(500);
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
    const popup = responsePopup(page);
    let textarea = await findTextarea(page);
    if (!textarea) {
      await clickFirstIn(popup, [], HH.coverLetterToggleText, 3000);
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

    if (await detectCaptcha(page)) {
      return captureAndFail(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
        "captcha_or_antibot",
        "CAPTCHA / antibot detected before submit. Stopping (never bypass).",
      );
    }

    const submitted = await clickSubmit(page, 6000);
    if (!submitted) {
      const block = await classifySubmitBlock(page);
      if (block === "captcha_or_antibot") {
        return captureAndFail(
          page,
          context,
          screenshotPath,
          tracePath,
          tracingStarted,
          "captcha_or_antibot",
          "CAPTCHA blocks submit (button disabled or antibot overlay).",
        );
      }
      if (block === "already_applied") {
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
      if (block === "success") {
        return captureAndSuccess(
          page,
          context,
          screenshotPath,
          tracePath,
          tracingStarted,
          "Application submitted (success detected without submit click).",
        );
      }
      return captureAndFail(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
        "selector_broken",
        "Submit control not found.",
      );
    }

    await page.waitForTimeout(2500);
    if (await detectCaptcha(page)) {
      const block = await classifySubmitBlock(page);
      if (block === "success" || block === "already_applied") {
        return captureAndSuccess(
          page,
          context,
          screenshotPath,
          tracePath,
          tracingStarted,
          "Application submitted.",
        );
      }
      return captureAndFail(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
        "captcha_or_antibot",
        "CAPTCHA appeared at submit.",
      );
    }
    if ((await detectSuccess(page)) || (await detectAlreadyApplied(page))) {
      return captureAndSuccess(
        page,
        context,
        screenshotPath,
        tracePath,
        tracingStarted,
        "Application submitted.",
      );
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
