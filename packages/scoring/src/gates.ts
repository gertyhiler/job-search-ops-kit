import type { NormalizedVacancy } from "@job-search/contracts";
import type { Blacklist, VacancyGates } from "@job-search/core";
import { isBlacklisted, ruleMatches } from "./matchers.ts";

export type GateAction = "continue" | "reject" | "manual_review";

export interface GateResult {
  action: GateAction;
  ruleId: string | null;
  reason: string | null;
}

/** First matching rule wins. Blacklist is always checked first. */
export function evaluateVacancyGates(
  v: NormalizedVacancy,
  gates: VacancyGates,
  blacklist: Blacklist,
): GateResult {
  if (isBlacklisted(v, blacklist)) {
    return {
      action: "reject",
      ruleId: "blacklist",
      reason: "company/domain/keyword blacklisted",
    };
  }

  for (const rule of gates.rules) {
    if (!rule.when || !ruleMatches(v, rule.when)) continue;
    if (rule.action === "pass") {
      return {
        action: "continue",
        ruleId: rule.id,
        reason: rule.reason ?? null,
      };
    }
    return {
      action: rule.action,
      ruleId: rule.id,
      reason: rule.reason ?? rule.id,
    };
  }

  if (gates.defaultAction === "reject") {
    return { action: "reject", ruleId: null, reason: "no gate rule matched" };
  }
  return { action: "continue", ruleId: null, reason: null };
}
