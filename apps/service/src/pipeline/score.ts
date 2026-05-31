import type { ApplyMode, NormalizedVacancy, ScoreResult } from "@job-search/contracts";
import { loadAutoApplyPolicy, loadVacancyScoring } from "@job-search/core";
import {
  enqueue,
  listVacanciesByStatus,
  setVacancyStatus,
  updateVacancyScore,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import {
  computeMechanicalScore,
  evaluateScoreRoute,
  evaluateVacancyGates,
  type MechanicalScore,
  type ScoreRoute,
} from "@job-search/scoring";
import type { PipelineContext } from "../context.ts";
import { applyPolicyClamp, classifyVacancyWithAi } from "../vacancy-classify.ts";
import { idleReason, logStageStart, readPipelineBacklog } from "./status.ts";
import { runRetryFailed } from "./retry-failed.ts";

export interface ScoreReport {
  requeued: number;
  scored: number;
  deferred: number;
  auto: number;
  highValue: number;
  manualReview: number;
  rejected: number;
  gateRejected: number;
  gateManual: number;
  routedAuto: number;
  routedAi: number;
  routedHighValue: number;
  routedMechanicalReject: number;
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

function mechanicalScoreResult(
  mechanical: MechanicalScore,
  applyMode: ApplyMode,
  routeReason: string | null,
): ScoreResult {
  const reasons = [...mechanical.reasons];
  if (routeReason) reasons.push(routeReason);
  return {
    fitScore: mechanical.fitScore,
    salaryScore: mechanical.salaryScore,
    riskScore: mechanical.riskScore,
    priorityScore: mechanical.priorityScore,
    applyMode,
    reasons,
    risks: mechanical.risks,
  };
}

function trackRoute(route: ScoreRoute, report: ScoreReport): void {
  switch (route) {
    case "auto":
      report.routedAuto += 1;
      break;
    case "ai_score":
      report.routedAi += 1;
      break;
    case "high_value":
      report.routedHighValue += 1;
      break;
    case "reject":
      report.routedMechanicalReject += 1;
      break;
    default:
      break;
  }
}

export async function runScore(
  ctx: PipelineContext,
  limit = 300,
): Promise<ScoreReport> {
  const scoring = loadVacancyScoring();
  const gates = {
    version: scoring.version,
    defaultAction: scoring.filters.defaultAction,
    rules: scoring.filters.rules,
  };
  const blacklist = {
    version: scoring.version,
    ...scoring.filters.blacklist,
  };
  const policy = loadAutoApplyPolicy();
  const target = { version: scoring.version, companies: scoring.routing.premium.companies };

  const retry = runRetryFailed(ctx);
  const report: ScoreReport = {
    requeued: retry.scoreFailures,
    scored: 0,
    deferred: 0,
    auto: 0,
    highValue: 0,
    manualReview: 0,
    rejected: 0,
    gateRejected: 0,
    gateManual: 0,
    routedAuto: 0,
    routedAi: 0,
    routedHighValue: 0,
    routedMechanicalReject: 0,
  };

  const rows = listVacanciesByStatus(ctx.db, "normalized", limit);
  logStageStart(ctx, "score", { batch: rows.length, limit });

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

    const mechanical = computeMechanicalScore(normalized, scoring, policy);
    const decision = evaluateScoreRoute(normalized, scoring, mechanical, policy);
    trackRoute(decision.route, report);

    if (decision.route === "ai_score") {
      let score: ScoreResult;
      let usedAi: boolean;
      try {
        ({ score, usedAi } = await classifyVacancyWithAi(
          {
            env: ctx.env,
            paths: ctx.paths,
            db: ctx.db,
            logger: ctx.logger,
          },
          normalized,
          policy,
          target,
        ));
      } catch {
        report.deferred += 1;
        continue;
      }

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
          route: decision.route,
          routeRuleId: decision.ruleId,
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
      continue;
    }

    const applyMode =
      decision.route === "reject"
        ? "reject"
        : decision.route === "high_value"
          ? "high_value"
          : decision.route === "manual_review"
            ? "manual_review"
            : "auto";

    let score = mechanicalScoreResult(mechanical, applyMode, decision.reason);
    if (applyMode === "auto" || applyMode === "high_value") {
      score = applyPolicyClamp(score, policy, target, normalized);
    }

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
        usedAi: false,
        route: decision.route,
        routeRuleId: decision.ruleId,
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

  const backlog = readPipelineBacklog(ctx);
  ctx.logger.info(
    {
      report,
      backlog,
      backlogRemaining: backlog.normalized,
      idle: idleReason("score", backlog),
    },
    report.scored > 0 || report.deferred > 0
      ? "Score tick finished"
      : "Score tick idle",
  );
  return report;
}
