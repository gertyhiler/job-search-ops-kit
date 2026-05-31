import type { JobSourceAdapter } from "@job-search/contracts";
import type { Env, Paths, SearchStrategy } from "@job-search/core";
import { hhPlaywrightProfileFromEnv } from "@job-search/core";
import { HhAdapter } from "./hh/adapter.ts";

/** Build all enabled source adapters. Add new boards here. */
export function createAdapters(
  env: Env,
  strategy: SearchStrategy,
  paths: Pick<Paths, "storageStatePath">,
): JobSourceAdapter[] {
  const profile = hhPlaywrightProfileFromEnv(env);
  return [
    new HhAdapter({
      storageStatePath: paths.storageStatePath,
      strategy,
      profile,
    }),
  ];
}
