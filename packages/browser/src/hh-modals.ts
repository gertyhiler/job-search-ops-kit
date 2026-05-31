import type { Page } from "playwright";
import { HH } from "./selectors.ts";

/** Visible HH overlay/dialog (Magritte modal layer). */
export function visibleOverlay(page: Page) {
  return page.locator('[class*="overlay"]:visible, [role="dialog"]:visible').first();
}

async function overlayText(page: Page): Promise<string> {
  try {
    const text = await visibleOverlay(page).innerText({ timeout: 2000 });
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export async function detectCrossCountryModal(page: Page): Promise<boolean> {
  const text = (await overlayText(page)).toLowerCase();
  return HH.crossCountryText.some((n) => text.includes(n.toLowerCase()));
}

/** Confirm "apply to vacancy in another country" interstitial. Returns true if dismissed. */
export async function dismissCrossCountryModal(page: Page): Promise<boolean> {
  if (!(await detectCrossCountryModal(page))) return false;
  for (const label of HH.crossCountryConfirmText) {
    const btn = visibleOverlay(page).getByRole("button", { name: label }).first();
    if (await btn.count()) {
      await btn.click({ timeout: 6000 });
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

export async function waitForResponsePopup(page: Page, timeoutMs = 8000): Promise<boolean> {
  const popup = page.locator(
    '[data-qa="vacancy-response-popup-form-letter-input"], [data-qa="vacancy-response-submit-popup"], [data-qa*="vacancy-response"]',
  );
  try {
    await popup.first().waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** Response popup root — scopes submit/letter controls away from the vacancy page. */
export function responsePopup(page: Page) {
  return page.locator('[class*="overlay"]:visible').last();
}

export async function detectResumeChooserInPopup(page: Page): Promise<boolean> {
  const text = (await overlayText(page)).toLowerCase();
  return HH.resumeChooserText.some((n) => text.includes(n.toLowerCase()));
}

/**
 * When HH asks which resume to send, pick the first listed option.
 * Returns true if a choice was made.
 */
export async function selectResumeInPopup(page: Page): Promise<boolean> {
  if (!(await detectResumeChooserInPopup(page))) return false;

  const popup = responsePopup(page);
  for (const sel of HH.resumeOptionSelectors) {
    const option = popup.locator(sel).first();
    if (await option.count()) {
      await option.click({ timeout: 4000 });
      await page.waitForTimeout(500);
      return true;
    }
  }

  // Fallback: click first radio inside popup
  const radio = popup.locator('input[type="radio"]').first();
  if (await radio.count()) {
    await radio.click({ timeout: 4000 });
    return true;
  }
  return false;
}
