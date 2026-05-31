import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { resolvePaths } from "./paths.ts";

export const searchStrategySchema = z.object({
  version: z.number().default(1),
  queries: z.array(z.string()).default([]),
  areas: z.array(z.number()).default([113]),
  schedule: z.array(z.string()).default([]),
  salaryFloor: z.number().nullable().default(null),
  perQueryLimit: z.number().int().positive().default(50),
  excludeKeywords: z.array(z.string()).default([]),
  experience: z.string().nullable().default(null),
});
export type SearchStrategy = z.infer<typeof searchStrategySchema>;

export const autoApplyPolicySchema = z.object({
  version: z.number().default(1),
  mode: z.enum(["dry_run", "real"]).default("dry_run"),
  fitScoreMin: z.number().default(60),
  riskScoreMax: z.number().default(40),
  salaryFloor: z.number().nullable().default(null),
  maxAutoApplicationsPerDay: z.number().int().default(50),
  maxApplicationsPerCompanyPer30Days: z.number().int().default(2),
  maxFailedAttemptsPerPlaybookBeforeDisable: z.number().int().default(5),
  highValuePriorityMin: z.number().default(85),
});
export type AutoApplyPolicy = z.infer<typeof autoApplyPolicySchema>;

export const manualReviewPolicySchema = z.object({
  version: z.number().default(1),
  escalateWhen: z
    .object({
      companyInTargetList: z.boolean().default(true),
      hasQuestionnaire: z.boolean().default(true),
      mentionsRelocation: z.boolean().default(true),
      mentionsCitizenshipOrVisa: z.boolean().default(true),
      mentionsSalaryNegotiationRequired: z.boolean().default(true),
      priorityAtLeast: z.number().default(85),
    })
    .default({}),
  sensitiveTopics: z.array(z.string()).default([]),
});
export type ManualReviewPolicy = z.infer<typeof manualReviewPolicySchema>;

export const blacklistSchema = z.object({
  version: z.number().default(1),
  companies: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});
export type Blacklist = z.infer<typeof blacklistSchema>;

const gateRuleWhenSchema = z.object({
  titleContainsAny: z.array(z.string()).optional(),
  descriptionContainsAny: z.array(z.string()).optional(),
  haystackContainsAny: z.array(z.string()).optional(),
  haystackContainsAll: z.array(z.string()).optional(),
  companyContainsAny: z.array(z.string()).optional(),
  keySkillsContainsAny: z.array(z.string()).optional(),
  remoteType: z.union([z.string(), z.array(z.string())]).optional(),
  locationContainsAny: z.array(z.string()).optional(),
  salaryDisclosed: z.boolean().optional(),
  salaryRubGte: z.number().optional(),
  salaryRubLt: z.number().optional(),
});

export const vacancyGateRuleSchema = z.object({
  id: z.string().min(1),
  when: gateRuleWhenSchema.optional(),
  action: z.enum(["pass", "reject", "manual_review"]),
  reason: z.string().optional(),
});

export const vacancyGatesSchema = z.object({
  version: z.number().default(1),
  defaultAction: z.enum(["continue", "reject"]).default("continue"),
  rules: z.array(vacancyGateRuleSchema).default([]),
});
export type VacancyGates = z.infer<typeof vacancyGatesSchema>;
export type VacancyGateRule = z.infer<typeof vacancyGateRuleSchema>;

export const targetCompaniesSchema = z.object({
  version: z.number().default(1),
  companies: z.array(z.string()).default([]),
});
export type TargetCompanies = z.infer<typeof targetCompaniesSchema>;

export const resumeThemeSchema = z.object({
  version: z.number().default(1),
  fontFamily: z.string().default("Liberation Sans"),
  fontSizePt: z.number().default(10),
  accentColor: z.string().default("#1f4e79"),
  textColor: z.string().default("#1a1a1a"),
  mutedColor: z.string().default("#666666"),
  marginCm: z.number().default(1.6),
  lineSpacingEm: z.number().default(0.6),
  sectionGapEm: z.number().default(0.9),
});
export type ResumeTheme = z.infer<typeof resumeThemeSchema>;

function readYamlOrDefault<S extends z.ZodTypeAny>(
  dataFile: string,
  defaultFile: string,
  schema: S,
): z.infer<S> {
  const file = existsSync(dataFile) ? dataFile : defaultFile;
  const raw = existsSync(file) ? parseYaml(readFileSync(file, "utf8")) : {};
  return schema.parse(raw ?? {}) as z.infer<S>;
}

export function loadSearchStrategy(): SearchStrategy {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "search-strategy.yaml"),
    path.join(p.configDefaultsDir, "search-strategy.template.yaml"),
    searchStrategySchema,
  );
}

export function loadAutoApplyPolicy(): AutoApplyPolicy {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "auto-apply-policy.yaml"),
    path.join(p.configDefaultsDir, "auto-apply-policy.template.yaml"),
    autoApplyPolicySchema,
  );
}

export function loadManualReviewPolicy(): ManualReviewPolicy {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "manual-review-policy.yaml"),
    path.join(p.configDefaultsDir, "manual-review-policy.template.yaml"),
    manualReviewPolicySchema,
  );
}

export function loadBlacklist(): Blacklist {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "blacklist.yaml"),
    path.join(p.configDefaultsDir, "blacklist.template.yaml"),
    blacklistSchema,
  );
}

export function loadVacancyGates(): VacancyGates {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "vacancy-gates.yaml"),
    path.join(p.configDefaultsDir, "vacancy-gates.template.yaml"),
    vacancyGatesSchema,
  );
}

export function loadTargetCompanies(): TargetCompanies {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "target-companies.yaml"),
    path.join(p.configDefaultsDir, "target-companies.template.yaml"),
    targetCompaniesSchema,
  );
}

export function loadResumeTheme(): ResumeTheme {
  const p = resolvePaths();
  return readYamlOrDefault(
    path.join(p.resumeDir, "resume-theme.yaml"),
    path.join(p.configDefaultsDir, "resume-theme.template.yaml"),
    resumeThemeSchema,
  );
}
