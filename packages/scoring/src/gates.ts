import type { NormalizedVacancy } from "@job-search/contracts";
import type { Blacklist, VacancyGates } from "@job-search/core";

export type GateAction = "continue" | "reject" | "manual_review";

export interface GateResult {
  action: GateAction;
  ruleId: string | null;
  reason: string | null;
}

function haystack(v: NormalizedVacancy): string {
  return `${v.title} ${v.description} ${v.keySkills.join(" ")} ${v.companyName}`.toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => n && text.includes(n.toLowerCase()));
}

function salaryRubAmount(v: NormalizedVacancy): number | null {
  const amount = v.salaryMax ?? v.salaryMin;
  if (amount === null) return null;
  const cur = (v.salaryCurrency ?? "RUR").toUpperCase();
  if (cur !== "RUR" && cur !== "RUB") return null;
  return amount;
}

function isSalaryDisclosed(v: NormalizedVacancy): boolean {
  return v.salaryMin !== null || v.salaryMax !== null;
}

function matchesRemoteType(
  v: NormalizedVacancy,
  expected: string | string[],
): boolean {
  const values = Array.isArray(expected) ? expected : [expected];
  return values.map((x) => x.toLowerCase()).includes(v.remoteType);
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

function ruleMatches(
  v: NormalizedVacancy,
  when: NonNullable<VacancyGates["rules"][number]["when"]>,
): boolean {
  const text = haystack(v);
  const title = v.title.toLowerCase();
  const desc = v.description.toLowerCase();
  const location = (v.location ?? "").toLowerCase();
  const skills = v.keySkills.join(" ").toLowerCase();

  if (when.titleContainsAny?.length && !includesAny(title, when.titleContainsAny))
    return false;
  if (
    when.descriptionContainsAny?.length &&
    !includesAny(desc, when.descriptionContainsAny)
  )
    return false;
  if (when.haystackContainsAny?.length && !includesAny(text, when.haystackContainsAny))
    return false;
  if (
    when.haystackContainsAll?.length &&
    !when.haystackContainsAll.every((k) => text.includes(k.toLowerCase()))
  )
    return false;
  if (
    when.companyContainsAny?.length &&
    !includesAny(v.companyName.toLowerCase(), when.companyContainsAny)
  )
    return false;
  if (when.keySkillsContainsAny?.length && !includesAny(skills, when.keySkillsContainsAny))
    return false;
  if (when.remoteType !== undefined && !matchesRemoteType(v, when.remoteType))
    return false;
  if (
    when.locationContainsAny?.length &&
    !includesAny(location, when.locationContainsAny)
  )
    return false;
  if (
    when.salaryDisclosed !== undefined &&
    isSalaryDisclosed(v) !== when.salaryDisclosed
  )
    return false;

  const rub = salaryRubAmount(v);
  if (when.salaryRubGte !== undefined) {
    if (rub === null || rub < when.salaryRubGte) return false;
  }
  if (when.salaryRubLt !== undefined) {
    if (rub === null || rub >= when.salaryRubLt) return false;
  }

  return true;
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
