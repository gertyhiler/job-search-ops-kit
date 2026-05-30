import path from "node:path";
import { ensureDir } from "@job-search/core";
import { closeQuietly, launchContext } from "./browser.ts";
import { HH } from "./selectors.ts";

export interface LoginBootstrapOptions {
  storageStatePath: string;
  loginUrl?: string;
  timeoutMs?: number;
  onStatus?: (message: string) => void;
}

export interface LoginBootstrapResult {
  ok: boolean;
  storageStatePath: string;
  message: string;
}

/**
 * Opens a real (headed) browser so the user can log into HH manually
 * (handling any 2FA/captcha themselves), then persists the session state.
 * We never store passwords; only the resulting cookie/session state.
 */
export async function loginBootstrap(
  opts: LoginBootstrapOptions,
): Promise<LoginBootstrapResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const status = opts.onStatus ?? (() => {});
  ensureDir(path.dirname(opts.storageStatePath));

  const { browser, context } = await launchContext({ headless: false });
  try {
    const page = await context.newPage();
    await page.goto(opts.loginUrl ?? "https://hh.ru/account/login", {
      waitUntil: "domcontentloaded",
    });
    status(
      "Browser opened. Log in to HH in the window. Waiting for an authenticated session...",
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      if (
        cookies.some((c) => c.name === HH.authCookieName && Boolean(c.value))
      ) {
        await context.storageState({ path: opts.storageStatePath });
        status("Authenticated. Session state saved.");
        return {
          ok: true,
          storageStatePath: opts.storageStatePath,
          message: "Session saved.",
        };
      }
      await page.waitForTimeout(2000);
    }
    return {
      ok: false,
      storageStatePath: opts.storageStatePath,
      message: "Timed out waiting for login. Re-run hh:login.",
    };
  } finally {
    await closeQuietly(browser);
  }
}
