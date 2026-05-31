import type { NormalizedVacancy } from "@job-search/contracts";
import type { AutoApplyPolicy, VacancyScoring } from "@job-search/core";
import {
  hasSensitiveKeyword,
  isTargetCompany,
  ruleMatches,
  whenAnyMatches,
} from "./matchers.ts";
import type { MechanicalScore } from "./mechanical-score.ts";

export type ScoreRoute =
  | "auto"
  | "ai_score"
  | "manual_review"
  | "high_value"
  | "reject";

export interface ScoreRouteDecision {
  route: ScoreRoute;
  ruleId: string | null;
  reason: string | null;
}

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

function matchesPremium(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
): { matched: boolean; ruleId: string | null; reason: string | null } {
  const premium = scoring.routing.premium;
  if (isTargetCompany(v, premium.companies)) {
    return {
      matched: true,
      ruleId: "premium-target-company",
      reason: "target company (premium path)",
    };
  }
  for (const clause of premium.whenAny) {
    if (ruleMatches(v, clause)) {
      return {
        matched: true,
        ruleId: "premium-when-any",
        reason: "premium trigger matched",
      };
    }
  }
  return { matched: false, ruleId: null, reason: null };
}

function matchesAiScore(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  mechanical: MechanicalScore,
): boolean {
  const cfg = scoring.routing.aiScore;
  if (
    cfg.fitScoreBetween &&
    inRange(
      mechanical.fitScore,
      cfg.fitScoreBetween[0],
      cfg.fitScoreBetween[1],
    )
  ) {
    return true;
  }
  if (cfg.whenAny.length && whenAnyMatches(v, cfg.whenAny)) return true;
  return false;
}

/** Decide score path after mechanical filters pass. */
export function evaluateScoreRoute(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  mechanical: MechanicalScore,
  policy: AutoApplyPolicy,
): ScoreRouteDecision {
  const reject = scoring.routing.reject;
  if (
    reject.fitScoreLt !== undefined &&
    mechanical.fitScore < reject.fitScoreLt
  ) {
    return {
      route: "reject",
      ruleId: "routing-reject-fit",
      reason: `fit below ${reject.fitScoreLt}`,
    };
  }
  if (
    reject.riskScoreGt !== undefined &&
    mechanical.riskScore > reject.riskScoreGt
  ) {
    return {
      route: "reject",
      ruleId: "routing-reject-risk",
      reason: `risk above ${reject.riskScoreGt}`,
    };
  }

  const manual = scoring.routing.manualReview;
  if (
    manual.sensitiveKeyword &&
    hasSensitiveKeyword(v, scoring.signals.sensitive)
  ) {
    return {
      route: "manual_review",
      ruleId: "routing-sensitive",
      reason: "sensitive topic in vacancy text",
    };
  }
  for (const clause of manual.whenAny) {
    if (ruleMatches(v, clause)) {
      return {
        route: "manual_review",
        ruleId: "routing-manual-when-any",
        reason: "manual review trigger matched",
      };
    }
  }

  const premium = matchesPremium(v, scoring);
  if (premium.matched) {
    return {
      route: "high_value",
      ruleId: premium.ruleId,
      reason: premium.reason,
    };
  }

  if (
    mechanical.fitScore >= policy.fitScoreMin &&
    mechanical.riskScore <= policy.riskScoreMax
  ) {
    return {
      route: "auto",
      ruleId: "routing-policy-fit",
      reason: "meets auto-apply score thresholds",
    };
  }

  if (matchesAiScore(v, scoring, mechanical)) {
    return {
      route: "ai_score",
      ruleId: "routing-ai-score",
      reason: "ambiguous fit — LLM classify",
    };
  }

  return {
    route: scoring.routing.default,
    ruleId: "routing-default",
    reason: `default route (${scoring.routing.default})`,
  };
}
