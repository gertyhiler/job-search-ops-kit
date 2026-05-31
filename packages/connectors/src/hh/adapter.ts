import type {
  JobSourceAdapter,
  NormalizedVacancy,
  RawVacancy,
} from "@job-search/contracts";
import { scrapeHhVacancies } from "@job-search/browser";
import type { SearchStrategy, PlaywrightProfile } from "@job-search/core";
import { mapWebToHhDetail } from "./map-web.ts";
import type { HhVacancyDetail } from "./client.ts";
import { normalizeHhVacancy } from "./normalize.ts";

export interface HhAdapterOptions {
  storageStatePath: string;
  strategy: SearchStrategy;
  detailDelayMs?: number;
  maxPagesPerQuery?: number;
  profile?: PlaywrightProfile;
}

export class HhAdapter implements JobSourceAdapter {
  source = "hh";
  capabilities: JobSourceAdapter["capabilities"] = ["scrape"];
  readonly #opts: HhAdapterOptions;

  constructor(opts: HhAdapterOptions) {
    this.#opts = opts;
  }

  async fetchNewJobs(since: Date | null): Promise<RawVacancy[]> {
    const web = await scrapeHhVacancies({
      storageStatePath: this.#opts.storageStatePath,
      strategy: this.#opts.strategy,
      since,
      detailDelayMs: this.#opts.detailDelayMs,
      profile: this.#opts.profile,
    });
    return web.map((item) => mapWebToHhDetail(item) as unknown as RawVacancy);
  }

  normalize(raw: RawVacancy): NormalizedVacancy {
    return normalizeHhVacancy(raw as unknown as HhVacancyDetail);
  }
}
