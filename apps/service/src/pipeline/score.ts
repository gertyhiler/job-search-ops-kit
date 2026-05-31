import type { NormalizedVacancy } from "@job-search/contracts";
import {
  loadAutoApplyPolicy,
  loadBlacklist,
  loadTargetCompanies,
  loadVacancyGates,
} from "@job-search/core";
import {
  enqueue,
  listVacanciesByStatus,
  setVacancyStatus,
  updateVacancyScore,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import { evaluateVacancyGates } from "@job-search/scoring";
import type { PipelineContext } from "../context.ts";
import { classifyVacancyWithAi } from "../vacancy-classify.ts";

export interface ScoreReport {
  scored: number;
  auto: number;
  highValue: number;
  manualReview: number;
  rejected: number;
  gateRejected: number;
  gateManual: number;
}

function routeAfterScore(
  ctx: PipelineContext,
  rowId: number,
  applyMode: string,
  priority: number,
  risks: string[],
  report: ScoreReport,
): void {
  switch (applyMode) {
    case "auto":
      report.auto += 1;
      break;
    case "high_value":
      report.highValue += 1;
      enqueue(ctx.db, {
        type: "high_value",
        entityType: "vacancy",
        entityId: rowId,
        priority: Math.round(priority),
        reason: "high-value vacancy",
      });
      break;
    case "manual_review":
      report.manualReview += 1;
      enqueue(ctx.db, {
        type: "manual_review",
        entityType: "vacancy",
        entityId: rowId,
        reason: risks.join("; ") || "needs review",
      });
      setVacancyStatus(ctx.db, rowId, "queued");
      break;
    case "reject":
      report.rejected += 1;
      setVacancyStatus(ctx.db, rowId, "rejected");
      break;
  }
}

export async function runScore(
  ctx: PipelineContext,
  limit = 300,
): Promise<ScoreReport> {
  const gates = loadVacancyGates();
  const blacklist = loadBlacklist();
  const policy = loadAutoApplyPolicy();
  const target = loadTargetCompanies();

  const report: ScoreReport = {
    scored: 0,
    auto: 0,
    highValue: 0,
    manualReview: 0,
    rejected: 0,
    gateRejected: 0,
    gateManual: 0,
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
      report.rejected += 1;
      continue;
    }

    const gate = evaluateVacancyGates(normalized, gates, blacklist);
    if (gate.action === "reject") {
      setVacancyStatus(ctx.db, row.id, "rejected");
      report.rejected += 1;
      report.gateRejected += 1;
      recordEvent(ctx.db, {
        type: "vacancy_gate_rejected",
        entityType: "vacancy",
        entityId: row.id,
        payload: { ruleId: gate.ruleId, reason: gate.reason },
      });
      continue;
    }
    if (gate.action === "manual_review") {
      updateVacancyScore(ctx.db, row.id, {
        fitScore: 0,
        salaryScore: 50,
        riskScore: 0,
        priorityScore: 0,
        applyMode: "manual_review",
        reasons: gate.reason ? [gate.reason] : [],
        risks: gate.reason ? [gate.reason] : [],
      });
      report.scored += 1;
      report.gateManual += 1;
      routeAfterScore(
        ctx,
        row.id,
        "manual_review",
        0,
        gate.reason ? [gate.reason] : [],
        report,
      );
      recordEvent(ctx.db, {
        type: "vacancy_gate_manual_review",
        entityType: "vacancy",
        entityId: row.id,
        payload: { ruleId: gate.ruleId, reason: gate.reason },
      });
      continue;
    }

    const { score, usedAi } = await classifyVacancyWithAi(
      {
        env: ctx.env,
        paths: ctx.paths,
        db: ctx.db,
        logger: ctx.logger,
      },
      normalized,
      policy,
      target,
    );

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
        usedAi,
        gateRuleId: gate.ruleId,
      },
    });

    routeAfterScore(
      ctx,
      row.id,
      score.applyMode,
      score.priorityScore,
      score.risks,
      report,
    );
  }

  ctx.logger.info({ report }, "Score stage finished");
  return report;
}
