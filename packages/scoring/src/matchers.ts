import type { NormalizedVacancy } from "@job-search/contracts";
import type { Blacklist, GateRuleWhen, VacancyGates } from "@job-search/core";

export function haystack(v: NormalizedVacancy): string {
  return `${v.title} ${v.description} ${v.keySkills.join(" ")} ${v.companyName}`.toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => n && text.includes(n.toLowerCase()));
}

export function salaryRubAmount(v: NormalizedVacancy): number | null {
  const amount = v.salaryMax ?? v.salaryMin;
  if (amount === null) return null;
  const cur = (v.salaryCurrency ?? "RUR").toUpperCase();
  if (cur !== "RUR" && cur !== "RUB") return null;
  return amount;
}

export function isSalaryDisclosed(v: NormalizedVacancy): boolean {
  return v.salaryMin !== null || v.salaryMax !== null;
}

function matchesRemoteType(
  v: NormalizedVacancy,
  expected: string | string[],
): boolean {
  const values = Array.isArray(expected) ? expected : [expected];
  return values.map((x) => x.toLowerCase()).includes(v.remoteType);
}

export function isBlacklisted(v: NormalizedVacancy, blacklist: Blacklist): boolean {
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

export function isTargetCompany(
  v: NormalizedVacancy,
  companies: string[],
): boolean {
  const name = v.companyName.toLowerCase();
  return companies.some((c) => c && name.includes(c.toLowerCase()));
}

export function ruleMatches(v: NormalizedVacancy, when: GateRuleWhen): boolean {
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
  if (
    when.keySkillsContainsAny?.length &&
    !includesAny(skills, when.keySkillsContainsAny)
  )
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

export function firstMatchingRuleId(
  v: NormalizedVacancy,
  rules: VacancyGates["rules"],
): string | null {
  for (const rule of rules) {
    if (!rule.when || !ruleMatches(v, rule.when)) continue;
    return rule.id;
  }
  return null;
}

export function whenAnyMatches(
  v: NormalizedVacancy,
  clauses: GateRuleWhen[],
): boolean {
  return clauses.some((when) => ruleMatches(v, when));
}

export function hasSensitiveKeyword(
  v: NormalizedVacancy,
  keywords: string[],
): boolean {
  const text = haystack(v);
  return keywords.some((kw) => kw && text.includes(kw.toLowerCase()));
}
