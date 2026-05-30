import type { JobSourceAdapter } from "@job-search/contracts";
import type { Env, SearchStrategy } from "@job-search/core";
import { HhAdapter } from "./hh/adapter.ts";

/** Build all enabled source adapters. Add new boards here. */
export function createAdapters(
  env: Env,
  strategy: SearchStrategy,
): JobSourceAdapter[] {
  return [
    new HhAdapter({
      userAgent: env.HH_USER_AGENT,
      oauthToken: env.HH_OAUTH_TOKEN || undefined,
      strategy,
    }),
  ];
}
