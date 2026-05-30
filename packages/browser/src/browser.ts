import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright";

export interface LaunchOptions {
  storageStatePath?: string;
  headless?: boolean;
}

export interface LaunchedBrowser {
  browser: Browser;
  context: BrowserContext;
}

export async function launchContext(
  opts: LaunchOptions = {},
): Promise<LaunchedBrowser> {
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  const context = await browser.newContext({
    storageState:
      opts.storageStatePath && existsSync(opts.storageStatePath)
        ? opts.storageStatePath
        : undefined,
    locale: "ru-RU",
    viewport: { width: 1280, height: 900 },
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
