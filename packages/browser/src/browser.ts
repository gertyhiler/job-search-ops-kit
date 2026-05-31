import { existsSync } from "node:fs";
import type { PlaywrightProfile } from "@job-search/core";
import {
  chromium,
  devices,
  type Browser,
  type BrowserContext,
} from "playwright";

const chromeDevice = devices["Desktop Chrome"];

export interface LaunchOptions {
  storageStatePath?: string;
  headless?: boolean;
  profile?: PlaywrightProfile;
}

export interface LaunchedBrowser {
  browser: Browser;
  context: BrowserContext;
}

async function launchChromeBrowser(headless: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless });
  } catch {
    return await chromium.launch({ headless });
  }
}

export async function launchContext(
  opts: LaunchOptions = {},
): Promise<LaunchedBrowser> {
  const browser = await launchChromeBrowser(opts.headless ?? true);
  const profile = opts.profile;
  const userAgent = profile?.userAgent?.trim() || chromeDevice.userAgent;
  const locale = profile?.locale ?? "ru-RU";
  const viewport = profile?.viewport ?? { width: 1280, height: 900 };
  const context = await browser.newContext({
    ...chromeDevice,
    userAgent,
    locale,
    viewport,
    storageState:
      opts.storageStatePath && existsSync(opts.storageStatePath)
        ? opts.storageStatePath
        : undefined,
  });
  return { browser, context };
}

export async function closeQuietly(browser: Browser | null): Promise<void> {
  try {
    await browser?.close();
  } catch {
    // ignore
  }
}
