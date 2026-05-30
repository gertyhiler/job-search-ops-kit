import type {
  ApplyMode,
  NormalizedVacancy,
  ScoreResult,
} from "@job-search/contracts";
import type {
  AutoApplyPolicy,
  Blacklist,
  ManualReviewPolicy,
  TargetCompanies,
} from "@job-search/core";
import {
  MISMATCH_KEYWORDS,
  POSITIVE_KEYWORDS,
  RISK_KEYWORDS,
  SENSITIVE_KEYWORDS,
} from "./keywords.ts";

export interface ScoringContext {
  autoApplyPolicy: AutoApplyPolicy;
  manualReviewPolicy: ManualReviewPolicy;
  blacklist: Blacklist;
  targetCompanies: TargetCompanies;
}

const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n));

function haystack(v: NormalizedVacancy): string {
  return `${v.title} ${v.description} ${v.keySkills.join(" ")} ${v.companyName}`.toLowerCase();
}

function salaryAmount(v: NormalizedVacancy): number | null {
  return v.salaryMax ?? v.salaryMin ?? null;
}

export function computeFitScore(
  v: NormalizedVacancy,
  reasons: string[],
): number {
  const text = haystack(v);
  let score = 30; // baseline for being in a frontend-ish search funnel
  for (const { kw, w } of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) {
      score += w;
      if (w >= 8) reasons.push(`matches "${kw}"`);
    }
  }
  for (const kw of MISMATCH_KEYWORDS) {
    if (text.includes(kw)) {
      score -= 25;
      reasons.push(`stack mismatch "${kw}"`);
    }
  }
  return clamp(score);
}

export function computeSalaryScore(
  v: NormalizedVacancy,
  policy: AutoApplyPolicy,
  reasons: string[],
  risks: string[],
): number {
  const amount = salaryAmount(v);
  const floor = policy.salaryFloor;
  if (amount === null) return 50;
  if (floor === null) {
    reasons.push("salary disclosed");
    return 75;
  }
  if (amount >= floor) {
    reasons.push(`salary >= floor (${amount})`);
    return clamp(70 + Math.min(30, ((amount - floor) / floor) * 30));
  }
  risks.push(`salary below floor (${amount} < ${floor})`);
  return clamp((amount / floor) * 40);
}

export function computeRiskScore(
  v: NormalizedVacancy,
  risks: string[],
): number {
  const text = haystack(v);
  let score = 0;
  for (const { kw, w } of RISK_KEYWORDS) {
    if (text.includes(kw)) {
      score += w;
      risks.push(`risk "${kw}"`);
    }
  }
  if (!v.companyName || v.companyName.trim().length === 0) {
    score += 15;
    risks.push("unclear company");
  }
  return clamp(score);
}

export function detectSensitive(v: NormalizedVacancy): boolean {
  const text = haystack(v);
  return SENSITIVE_KEYWORDS.some((kw) => text.includes(kw));
}

export function scoreVacancy(
  v: NormalizedVacancy,
  ctx: ScoringContext,
): ScoreResult {
  const reasons: string[] = [];
  const risks: string[] = [];

  const fitScore = computeFitScore(v, reasons);
  const salaryScore = computeSalaryScore(
    v,
    ctx.autoApplyPolicy,
    reasons,
    risks,
  );
  const riskScore = computeRiskScore(v, risks);
  const priorityScore = clamp(
    Math.round(fitScore * 0.55 + salaryScore * 0.25 + (100 - riskScore) * 0.2),
  );

  const applyMode = classifyApplyMode(
    v,
    { fitScore, salaryScore, riskScore, priorityScore },
    ctx,
    risks,
  );

  return {
    fitScore,
    salaryScore,
    riskScore,
    priorityScore,
    applyMode,
    reasons,
    risks,
  };
}

function isBlacklisted(v: NormalizedVacancy, blacklist: Blacklist): boolean {
  const name = v.companyName.toLowerCase();
  const text = haystack(v);
  if (blacklist.companies.some((c) => c && name.includes(c.toLowerCase())))
    return true;
  if (blacklist.domains.some((d) => d && text.includes(d.toLowerCase())))
    return true;
  if (blacklist.keywords.some((k) => k && text.includes(k.toLowerCase())))
    return true;
  return false;
}

function isTargetCompany(
  v: NormalizedVacancy,
  target: TargetCompanies,
): boolean {
  const name = v.companyName.toLowerCase();
  return target.companies.some((c) => c && name.includes(c.toLowerCase()));
}

export function classifyApplyMode(
  v: NormalizedVacancy,
  scores: {
    fitScore: number;
    salaryScore: number;
    riskScore: number;
    priorityScore: number;
  },
  ctx: ScoringContext,
  risks: string[],
): ApplyMode {
  const { autoApplyPolicy: policy, manualReviewPolicy: review } = ctx;

  if (isBlacklisted(v, ctx.blacklist)) {
    risks.push("company/domain blacklisted");
    return "reject";
  }
  if (scores.riskScore > policy.riskScoreMax) return "reject";
  if (scores.fitScore < policy.fitScoreMin) return "reject";

  if (
    isTargetCompany(v, ctx.targetCompanies) &&
    review.escalateWhen.companyInTargetList
  ) {
    return "high_value";
  }
  if (scores.priorityScore >= policy.highValuePriorityMin) return "high_value";

  if (
    detectSensitive(v) &&
    (review.escalateWhen.mentionsRelocation ||
      review.escalateWhen.mentionsCitizenshipOrVisa)
  ) {
    return "manual_review";
  }

  return "auto";
}
