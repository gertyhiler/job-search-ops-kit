import { existsSync } from "node:fs";
import type { PlaywrightProfile, SearchStrategy } from "@job-search/core";
import { closeQuietly, launchContext } from "./browser.ts";
import { detectCaptcha, isAuthenticated } from "./failure-detection.ts";
import { parseVacancyPageHtml } from "./parse-vacancy-page.ts";

const SHARDS_SEARCH_URL = "https://hh.ru/shards/vacancy/search";

export interface HhWebVacancy {
  vacancyId: number;
  name: string;
  company?: {
    id?: number;
    name?: string;
  };
  compensation?: {
    from?: number | null;
    to?: number | null;
    currencyCode?: string | null;
    gross?: boolean | null;
  };
  publicationTime?: {
    $?: string;
    "@timestamp"?: number;
  };
  area?: {
    "@id"?: number;
    name?: string;
  };
  "@workSchedule"?: string;
  workExperience?: string;
  employment?: {
    "@type"?: string;
  };
}

export interface HhWebVacancyDetail {
  description?: string;
  keySkills?: string[];
}

export interface HhWebVacancyWithDetail extends HhWebVacancy {
  detail?: HhWebVacancyDetail;
}

export interface HhSearchScrapeOptions {
  storageStatePath: string;
  strategy: SearchStrategy;
  since: Date | null;
  detailDelayMs?: number;
  headless?: boolean;
  profile?: PlaywrightProfile;
}

interface ShardsSearchResponse {
  vacancySearchResult?: {
    vacancies?: HhWebVacancy[];
    paging?: {
      lastPage?: { page?: number };
      next?: { disabled?: boolean };
    };
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function buildSearchUrl(params: {
  text: string;
  area: number;
  schedule?: string[];
  experience?: string | null;
  page: number;
}): string {
  const url = new URL(SHARDS_SEARCH_URL);
  url.searchParams.set("text", params.text);
  url.searchParams.set("area", String(params.area));
  url.searchParams.set("page", String(params.page));
  for (const schedule of params.schedule ?? []) {
    url.searchParams.append("schedule", schedule);
  }
  if (params.experience) {
    url.searchParams.set("experience", params.experience);
  }
  return url.toString();
}

function matchesExclude(item: HhWebVacancy, keywords: string[]): boolean {
  const haystack = item.name.toLowerCase();
  return keywords.some((kw) => kw && haystack.includes(kw.toLowerCase()));
}

/**
 * Fetch HH vacancies via Playwright: shards JSON for search, page HTML for details.
 * Requires a valid session from `hh:login`.
 */
export async function scrapeHhVacancies(
  opts: HhSearchScrapeOptions,
): Promise<HhWebVacancyWithDetail[]> {
  if (!existsSync(opts.storageStatePath)) {
    throw new Error(
      "HH session not found; run job-search hh:login to save browser session",
    );
  }

  const strategy = opts.strategy;
  const maxPages = Math.max(1, Math.ceil(strategy.perQueryLimit / 50));
  const detailDelayMs = opts.detailDelayMs ?? 200;
  const seen = new Set<number>();
  const kept: HhWebVacancy[] = [];

  const { browser, context } = await launchContext({
    storageStatePath: opts.storageStatePath,
    headless: opts.headless ?? true,
    profile: opts.profile,
  });

  try {
    const page = await context.newPage();
    await page.goto("https://hh.ru/", { waitUntil: "domcontentloaded" });

    if (!(await isAuthenticated(page))) {
      throw new Error("HH session expired; run job-search hh:login");
    }
    if (await detectCaptcha(page)) {
      throw new Error(
        "HH captcha detected; complete captcha manually via hh:login",
      );
    }

    for (const query of strategy.queries) {
      for (const area of strategy.areas) {
        let collected = 0;
        for (
          let pageNum = 0;
          pageNum < maxPages && collected < strategy.perQueryLimit;
          pageNum += 1
        ) {
          const url = buildSearchUrl({
            text: query,
            area,
            schedule:
              strategy.schedule.length > 0 ? strategy.schedule : undefined,
            experience: strategy.experience,
            page: pageNum,
          });
          const response = await context.request.get(url, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok()) {
            throw new Error(
              `HH shards search failed: ${response.status()} ${response.statusText()}`,
            );
          }
          const data = (await response.json()) as ShardsSearchResponse;
          const items = data.vacancySearchResult?.vacancies ?? [];
          if (items.length === 0) break;

          for (const item of items) {
            if (collected >= strategy.perQueryLimit) break;
            if (seen.has(item.vacancyId)) continue;
            const publishedAt = item.publicationTime?.$;
            if (
              opts.since &&
              publishedAt &&
              new Date(publishedAt) <= opts.since
            ) {
              continue;
            }
            if (matchesExclude(item, strategy.excludeKeywords)) continue;
            seen.add(item.vacancyId);
            kept.push(item);
            collected += 1;
          }

          const lastPage = data.vacancySearchResult?.paging?.lastPage?.page;
          const nextDisabled = data.vacancySearchResult?.paging?.next?.disabled;
          if (nextDisabled || (lastPage !== undefined && pageNum >= lastPage)) {
            break;
          }
          await sleep(detailDelayMs);
        }
      }
    }

    const results: HhWebVacancyWithDetail[] = [];
    for (const item of kept) {
      try {
        await page.goto(`https://hh.ru/vacancy/${item.vacancyId}`, {
          waitUntil: "domcontentloaded",
        });
        const html = await page.content();
        const parsed = parseVacancyPageHtml(html);
        results.push({
          ...item,
          detail: {
            ...(parsed.description ? { description: parsed.description } : {}),
            ...(parsed.keySkills ? { keySkills: parsed.keySkills } : {}),
          },
        });
      } catch {
        results.push({ ...item });
      }
      await sleep(detailDelayMs);
    }

    return results;
  } finally {
    await closeQuietly(browser);
  }
}
