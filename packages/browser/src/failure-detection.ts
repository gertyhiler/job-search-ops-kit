import type { Page } from "playwright";
import { HH } from "./selectors.ts";

async function bodyTextIncludes(
  page: Page,
  needles: string[],
): Promise<boolean> {
  try {
    const text = (
      await page.locator("body").innerText({ timeout: 3000 })
    ).toLowerCase();
    return needles.some((n) => text.includes(n.toLowerCase()));
  } catch {
    return false;
  }
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
  return bodyTextIncludes(page, HH.captchaText);
}

export async function detectQuestionnaire(page: Page): Promise<boolean> {
  return bodyTextIncludes(page, HH.questionnaireText);
}

export async function detectResumeChooser(page: Page): Promise<boolean> {
  return bodyTextIncludes(page, HH.resumeChooserText);
}

export async function detectSuccess(page: Page): Promise<boolean> {
  return bodyTextIncludes(page, HH.successText);
}
