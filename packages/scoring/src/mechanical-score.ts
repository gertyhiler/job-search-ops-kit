import type { NormalizedVacancy } from "@job-search/contracts";
import type { AutoApplyPolicy, VacancyScoring } from "@job-search/core";
import { haystack } from "./matchers.ts";

const MOBILE_REACT_MARKERS = [
  "react native",
  "react-native",
  "reactnative",
];

function isMobileReactStack(text: string): boolean {
  const t = text.toLowerCase();
  return MOBILE_REACT_MARKERS.some((m) => t.includes(m));
}

export interface MechanicalScore {
  fitScore: number;
  salaryScore: number;
  riskScore: number;
  priorityScore: number;
  reasons: string[];
  risks: string[];
}

const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n));

function priorityScore(
  fitScore: number,
  salaryScore: number,
  riskScore: number,
): number {
  return clamp(
    Math.round(fitScore * 0.55 + salaryScore * 0.25 + (100 - riskScore) * 0.2),
  );
}

function fieldWeights(scoring: VacancyScoring) {
  const hw = scoring.signals.haystack;
  return {
    title: hw.titleWeight,
    keySkills: hw.keySkillsWeight,
    description: hw.descriptionWeight,
    company: hw.companyWeight,
  };
}

function computeFitScore(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  reasons: string[],
): number {
  const weights = fieldWeights(scoring);
  const title = v.title.toLowerCase();
  const desc = v.description.toLowerCase();
  const skills = v.keySkills.join(" ").toLowerCase();
  const company = v.companyName.toLowerCase();
  let score = scoring.signals.fit.baseline;

  for (const kw of scoring.signals.fit.keywords) {
    const m = kw.match.toLowerCase();
    if (m === "react" && isMobileReactStack(haystack(v))) continue;
    let matched = false;
    if (title.includes(m)) {
      score += kw.weight * weights.title;
      matched = true;
    } else if (skills.includes(m)) {
      score += kw.weight * weights.keySkills;
      matched = true;
    } else if (desc.includes(m)) {
      score += kw.weight * weights.description;
      matched = true;
    } else if (company.includes(m)) {
      score += kw.weight * weights.company;
      matched = true;
    }
    if (matched && kw.weight >= 8) {
      reasons.push(kw.note ? kw.note : `matches "${kw.match}"`);
    }
  }

  const text = haystack(v);
  for (const mm of scoring.signals.fit.mismatch) {
    if (text.includes(mm.match.toLowerCase())) {
      score -= mm.penalty;
      reasons.push(`stack mismatch "${mm.match}"`);
    }
  }

  return clamp(score);
}

function computeSalaryScore(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  policy: AutoApplyPolicy,
  reasons: string[],
  risks: string[],
): number {
  const amount = v.salaryMax ?? v.salaryMin ?? null;
  const floor = policy.salaryFloor;
  if (amount === null) return scoring.signals.salary.undisclosedScore;
  if (floor === null) {
    reasons.push("salary disclosed");
    return scoring.signals.salary.disclosedScore;
  }
  if (amount >= floor) {
    reasons.push(`salary >= floor (${amount})`);
    return clamp(70 + Math.min(30, ((amount - floor) / floor) * 30));
  }
  risks.push(`salary below floor (${amount} < ${floor})`);
  return clamp((amount / floor) * 40);
}

function computeRiskScore(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  risks: string[],
): number {
  const text = haystack(v);
  let score = 0;
  for (const rk of scoring.signals.risk.keywords) {
    if (text.includes(rk.match.toLowerCase())) {
      score += rk.weight;
      risks.push(`risk "${rk.match}"`);
    }
  }
  if (!v.companyName || v.companyName.trim().length === 0) {
    score += 15;
    risks.push("unclear company");
  }
  return clamp(score);
}

export function computeMechanicalScore(
  v: NormalizedVacancy,
  scoring: VacancyScoring,
  policy: AutoApplyPolicy,
): MechanicalScore {
  const reasons: string[] = [];
  const risks: string[] = [];
  const fitScore = computeFitScore(v, scoring, reasons);
  const salaryScore = computeSalaryScore(v, scoring, policy, reasons, risks);
  const riskScore = computeRiskScore(v, scoring, risks);
  return {
    fitScore,
    salaryScore,
    riskScore,
    priorityScore: priorityScore(fitScore, salaryScore, riskScore),
    reasons,
    risks,
  };
}
