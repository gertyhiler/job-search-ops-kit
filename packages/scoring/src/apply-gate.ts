import type { AutoApplyPolicy } from "@job-search/core";

export interface ApplyGateInput {
  policy: AutoApplyPolicy;
  applyMode: string | null;
  fitScore: number | null;
  riskScore: number | null;
  alreadyApplied: boolean;
  applicationsToday: number;
  applicationsToCompanyLast30Days: number;
  playbookStatus: string; // 'active' | 'tested' | 'dry_run' | 'broken' | ...
}

export interface ApplyGateResult {
  allowed: boolean;
  /** When not allowed, where the vacancy should be routed. */
  route: "auto_apply" | "manual_review" | "skip";
  reason: string;
}

/**
 * Pure gate: decides whether the apply-queue may submit this vacancy.
 * It never bypasses safety; on doubt it routes to manual_review or skip.
 */
export function evaluateApplyGate(input: ApplyGateInput): ApplyGateResult {
  const { policy } = input;

  if (input.alreadyApplied) {
    return { allowed: false, route: "skip", reason: "already applied" };
  }
  if (input.applyMode === "reject") {
    return { allowed: false, route: "skip", reason: "classified reject" };
  }
  if (input.applyMode === "high_value" || input.applyMode === "manual_review") {
    return {
      allowed: false,
      route: "manual_review",
      reason: `requires review (${input.applyMode})`,
    };
  }
  if (input.applyMode !== "auto") {
    return {
      allowed: false,
      route: "manual_review",
      reason: "not auto-classified",
    };
  }
  if ((input.fitScore ?? 0) < policy.fitScoreMin) {
    return { allowed: false, route: "skip", reason: "fit below threshold" };
  }
  if ((input.riskScore ?? 100) > policy.riskScoreMax) {
    return {
      allowed: false,
      route: "manual_review",
      reason: "risk above threshold",
    };
  }
  if (input.applicationsToday >= policy.maxAutoApplicationsPerDay) {
    return {
      allowed: false,
      route: "skip",
      reason: "daily auto-apply limit reached",
    };
  }
  if (
    input.applicationsToCompanyLast30Days >=
    policy.maxApplicationsPerCompanyPer30Days
  ) {
    return {
      allowed: false,
      route: "skip",
      reason: "per-company limit reached",
    };
  }
  if (
    input.playbookStatus === "broken" ||
    input.playbookStatus === "needs_repair"
  ) {
    return {
      allowed: false,
      route: "manual_review",
      reason: "apply playbook disabled",
    };
  }

  return {
    allowed: true,
    route: "auto_apply",
    reason: "passes auto-apply policy",
  };
}
