import type { NormalizedVacancy } from "@job-search/contracts";
import { loadSearchStrategy } from "@job-search/core";
import { computeContentHash, createAdapters } from "@job-search/connectors";
import {
  getSourceCursor,
  setSourceCursor,
  upsertCompany,
  upsertVacancy,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import type { PipelineContext } from "../context.ts";

export interface SearchReport {
  found: number;
  created: number;
  updated: number;
}

export async function runSearch(ctx: PipelineContext): Promise<SearchReport> {
  const strategy = loadSearchStrategy();
  const adapters = createAdapters(ctx.env, strategy, ctx.paths);
  const report: SearchReport = { found: 0, created: 0, updated: 0 };

  for (const adapter of adapters) {
    const cursorIso = getSourceCursor(ctx.db, adapter.source);
    const since = cursorIso ? new Date(cursorIso) : null;

    let raw: Awaited<ReturnType<typeof adapter.fetchNewJobs>> = [];
    try {
      raw = await adapter.fetchNewJobs(since);
    } catch (error) {
      ctx.logger.error(
        {
          source: adapter.source,
          error: error instanceof Error ? error.message : String(error),
        },
        "Source fetch failed",
      );
      continue;
    }

    let maxPublished = cursorIso;
    for (const item of raw) {
      let normalized: NormalizedVacancy;
      try {
        normalized = adapter.normalize(item);
      } catch (error) {
        ctx.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "Normalize failed",
        );
        continue;
      }
      report.found += 1;

      const company = upsertCompany(ctx.db, {
        source: normalized.source,
        externalId: normalized.companyExternalId,
        name: normalized.companyName,
        url: null,
      });
      const hash = computeContentHash(normalized);
      const result = upsertVacancy(ctx.db, normalized, company.id, hash);
      if (result.isNew) {
        report.created += 1;
        recordEvent(ctx.db, {
          type: "vacancy_discovered",
          entityType: "vacancy",
          entityId: result.id,
          payload: {
            source: normalized.source,
            title: normalized.title,
            url: normalized.url,
          },
        });
      } else if (result.changed) {
        report.updated += 1;
      }

      if (!maxPublished || normalized.publishedAt > maxPublished) {
        maxPublished = normalized.publishedAt;
      }
    }

    if (maxPublished) setSourceCursor(ctx.db, adapter.source, maxPublished);
  }

  ctx.logger.info({ report }, "Search stage finished");
  return report;
}
