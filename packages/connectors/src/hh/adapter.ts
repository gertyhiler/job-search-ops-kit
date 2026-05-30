import type {
  JobSourceAdapter,
  NormalizedVacancy,
  RawVacancy,
} from "@job-search/contracts";
import type { SearchStrategy } from "@job-search/core";
import { HhClient, type HhSearchItem, type HhVacancyDetail } from "./client.ts";
import { normalizeHhVacancy } from "./normalize.ts";

export interface HhAdapterOptions {
  userAgent: string;
  oauthToken?: string;
  strategy: SearchStrategy;
  detailDelayMs?: number;
  maxPagesPerQuery?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export class HhAdapter implements JobSourceAdapter {
  source = "hh";
  capabilities: JobSourceAdapter["capabilities"] = ["api"];
  readonly #client: HhClient;
  readonly #opts: HhAdapterOptions;

  constructor(opts: HhAdapterOptions) {
    this.#opts = opts;
    this.#client = new HhClient({
      userAgent: opts.userAgent,
      oauthToken: opts.oauthToken,
    });
  }

  #matchesExclude(item: HhSearchItem): boolean {
    const haystack =
      `${item.name} ${item.snippet?.requirement ?? ""} ${item.snippet?.responsibility ?? ""}`.toLowerCase();
    return this.#opts.strategy.excludeKeywords.some(
      (kw) => kw && haystack.includes(kw.toLowerCase()),
    );
  }

  async fetchNewJobs(since: Date | null): Promise<RawVacancy[]> {
    const strategy = this.#opts.strategy;
    const maxPages =
      this.#opts.maxPagesPerQuery ??
      Math.max(1, Math.ceil(strategy.perQueryLimit / 50));
    const seen = new Set<string>();
    const kept: HhSearchItem[] = [];

    for (const query of strategy.queries) {
      for (const area of strategy.areas) {
        let collected = 0;
        for (
          let page = 0;
          page < maxPages && collected < strategy.perQueryLimit;
          page += 1
        ) {
          const response = await this.#client.searchVacancies({
            text: query,
            area,
            schedule:
              strategy.schedule.length > 0 ? strategy.schedule : undefined,
            experience: strategy.experience,
            page,
            perPage: 50,
          });
          if (response.items.length === 0) break;

          for (const item of response.items) {
            if (collected >= strategy.perQueryLimit) break;
            if (seen.has(item.id)) continue;
            if (since && new Date(item.published_at) <= since) continue;
            if (this.#matchesExclude(item)) continue;
            seen.add(item.id);
            kept.push(item);
            collected += 1;
          }
          if (page + 1 >= response.pages) break;
          await sleep(this.#opts.detailDelayMs ?? 200);
        }
      }
    }

    // Enrich kept items with full detail (description + key skills).
    const details: HhVacancyDetail[] = [];
    for (const item of kept) {
      try {
        const detail = await this.#client.getVacancy(item.id);
        details.push({ ...item, ...detail });
      } catch {
        // Fall back to the list snippet if detail fetch fails.
        details.push(item as HhVacancyDetail);
      }
      await sleep(this.#opts.detailDelayMs ?? 200);
    }

    return details as unknown as RawVacancy[];
  }

  normalize(raw: RawVacancy): NormalizedVacancy {
    return normalizeHhVacancy(raw as unknown as HhVacancyDetail);
  }
}
