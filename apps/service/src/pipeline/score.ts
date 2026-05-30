import type { NormalizedVacancy } from "@job-search/contracts";
import {
  loadAutoApplyPolicy,
  loadBlacklist,
  loadManualReviewPolicy,
  loadTargetCompanies,
} from "@job-search/core";
import {
  enqueue,
  listVacanciesByStatus,
  setVacancyStatus,
  updateVacancyScore,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import { scoreVacancy, type ScoringContext } from "@job-search/scoring";
import type { PipelineContext } from "../context.ts";

export interface ScoreReport {
  scored: number;
  auto: number;
  highValue: number;
  manualReview: number;
  rejected: number;
}

export async function runScore(
  ctx: PipelineContext,
  limit = 300,
): Promise<ScoreReport> {
  const scoringCtx: ScoringContext = {
    autoApplyPolicy: loadAutoApplyPolicy(),
    manualReviewPolicy: loadManualReviewPolicy(),
    blacklist: loadBlacklist(),
    targetCompanies: loadTargetCompanies(),
  };

  const report: ScoreReport = {
    scored: 0,
    auto: 0,
    highValue: 0,
    manualReview: 0,
    rejected: 0,
  };
  const rows = listVacanciesByStatus(ctx.db, "normalized", limit);

  for (const row of rows) {
    let normalized: NormalizedVacancy;
    try {
      normalized = JSON.parse(
        row.normalized_payload_json ?? "{}",
      ) as NormalizedVacancy;
    } catch {
      setVacancyStatus(ctx.db, row.id, "rejected");
      continue;
    }

    const score = scoreVacancy(normalized, scoringCtx);
    updateVacancyScore(ctx.db, row.id, score);
    report.scored += 1;
    recordEvent(ctx.db, {
      type: "vacancy_scored",
      entityType: "vacancy",
      entityId: row.id,
      payload: {
        fit: score.fitScore,
        risk: score.riskScore,
        priority: score.priorityScore,
        applyMode: score.applyMode,
      },
    });

    switch (score.applyMode) {
      case "auto":
        report.auto += 1;
        break;
      case "high_value":
        report.highValue += 1;
        enqueue(ctx.db, {
          type: "high_value",
          entityType: "vacancy",
          entityId: row.id,
          priority: Math.round(score.priorityScore),
          reason: "high-value vacancy",
        });
        break;
      case "manual_review":
        report.manualReview += 1;
        enqueue(ctx.db, {
          type: "manual_review",
          entityType: "vacancy",
          entityId: row.id,
          reason: score.risks.join("; ") || "needs review",
        });
        setVacancyStatus(ctx.db, row.id, "queued");
        break;
      case "reject":
        report.rejected += 1;
        setVacancyStatus(ctx.db, row.id, "rejected");
        break;
    }
  }

  ctx.logger.info({ report }, "Score stage finished");
  return report;
}
