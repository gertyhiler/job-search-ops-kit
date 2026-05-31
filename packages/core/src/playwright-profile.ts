import type { Env } from "./env.ts";

export interface PlaywrightProfile {
  /** Empty at runtime falls back to Playwright Desktop Chrome user agent. */
  userAgent?: string;
  locale: string;
  viewport: { width: number; height: number };
}

function profileFrom(
  userAgent: string,
  locale: string,
  viewportWidth: number,
  viewportHeight: number,
): PlaywrightProfile {
  const ua = userAgent.trim();
  return {
    ...(ua ? { userAgent: ua } : {}),
    locale,
    viewport: { width: viewportWidth, height: viewportHeight },
  };
}

/** Default Playwright browser context (non-HH flows). */
export function playwrightProfileFromEnv(
  env: Pick<
    Env,
    | "PLAYWRIGHT_USER_AGENT"
    | "PLAYWRIGHT_LOCALE"
    | "PLAYWRIGHT_VIEWPORT_WIDTH"
    | "PLAYWRIGHT_VIEWPORT_HEIGHT"
  >,
): PlaywrightProfile {
  return profileFrom(
    env.PLAYWRIGHT_USER_AGENT,
    env.PLAYWRIGHT_LOCALE,
    env.PLAYWRIGHT_VIEWPORT_WIDTH,
    env.PLAYWRIGHT_VIEWPORT_HEIGHT,
  );
}

/** HH search / apply / hh:login browser context. */
export function hhPlaywrightProfileFromEnv(
  env: Pick<
    Env,
    | "HH_PLAYWRIGHT_USER_AGENT"
    | "HH_PLAYWRIGHT_LOCALE"
    | "HH_PLAYWRIGHT_VIEWPORT_WIDTH"
    | "HH_PLAYWRIGHT_VIEWPORT_HEIGHT"
  >,
): PlaywrightProfile {
  return profileFrom(
    env.HH_PLAYWRIGHT_USER_AGENT,
    env.HH_PLAYWRIGHT_LOCALE,
    env.HH_PLAYWRIGHT_VIEWPORT_WIDTH,
    env.HH_PLAYWRIGHT_VIEWPORT_HEIGHT,
  );
}
