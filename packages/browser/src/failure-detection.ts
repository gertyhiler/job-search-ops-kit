import type { Page } from "playwright";
import { HH } from "./selectors.ts";
import { visibleOverlay } from "./hh-modals.ts";

async function pageTextIncludes(
  page: Page,
  needles: string[],
  root: "body" | "overlay" = "body",
): Promise<boolean> {
  try {
    const locator =
      root === "overlay" ? visibleOverlay(page) : page.locator("body");
    const text = (await locator.innerText({ timeout: 3000 })).toLowerCase();
    return needles.some((n) => text.includes(n.toLowerCase()));
  } catch {
    return false;
  }
}

async function bodyTextIncludes(
  page: Page,
  needles: string[],
): Promise<boolean> {
  return pageTextIncludes(page, needles, "body");
}

export async function isAuthenticated(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  const hasToken = cookies.some(
    (c) => c.name === HH.authCookieName && Boolean(c.value),
  );
  const role = cookies.find((c) => c.name === HH.authRoleCookieName)?.value;
  return hasToken && role === HH.authApplicantRole;
}

export async function detectAlreadyApplied(page: Page): Promise<boolean> {
  return bodyTextIncludes(page, HH.alreadyAppliedText);
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  if (await bodyTextIncludes(page, HH.captchaText)) return true;
  if (await pageTextIncludes(page, HH.captchaText, "overlay")) return true;
  const turnstile = page.locator(
    'iframe[src*="turnstile"], iframe[src*="captcha"], [class*="turnstile"]',
  );
  return (await turnstile.count().catch(() => 0)) > 0;
}

export async function detectQuestionnaire(page: Page): Promise<boolean> {
  return (
    (await bodyTextIncludes(page, HH.questionnaireText)) ||
    (await pageTextIncludes(page, HH.questionnaireText, "overlay"))
  );
}

export async function detectAuthWall(page: Page): Promise<boolean> {
  return bodyTextIncludes(page, HH.authWallText);
}

export async function detectResumeChooser(page: Page): Promise<boolean> {
  return (
    (await bodyTextIncludes(page, HH.resumeChooserText)) ||
    (await pageTextIncludes(page, HH.resumeChooserText, "overlay"))
  );
}

export async function detectSuccess(page: Page): Promise<boolean> {
  return (
    (await bodyTextIncludes(page, HH.successText)) ||
    (await pageTextIncludes(page, HH.successText, "overlay"))
  );
}
