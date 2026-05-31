import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { resolvePaths } from "./paths.ts";
import { loadEnv } from "./env.ts";

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
export type GateRuleWhen = z.infer<typeof gateRuleWhenSchema>;

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

const weightedKeywordSchema = z.object({
  match: z.string().min(1),
  weight: z.number(),
  note: z.string().optional(),
});

const mismatchKeywordSchema = z.object({
  match: z.string().min(1),
  penalty: z.number(),
});

export const vacancyScoringSchema = z.object({
  version: z.number().default(1),
  filters: z
    .object({
      blacklist: blacklistSchema.omit({ version: true }).default({}),
      defaultAction: z.enum(["continue", "reject"]).default("continue"),
      rules: z.array(vacancyGateRuleSchema).default([]),
    })
    .default({}),
  signals: z
    .object({
      haystack: z
        .object({
          titleWeight: z.number().default(2),
          keySkillsWeight: z.number().default(1.5),
          descriptionWeight: z.number().default(0.6),
          companyWeight: z.number().default(1),
        })
        .default({}),
      fit: z
        .object({
          baseline: z.number().default(30),
          keywords: z.array(weightedKeywordSchema).default([]),
          mismatch: z.array(mismatchKeywordSchema).default([]),
        })
        .default({}),
      risk: z
        .object({
          keywords: z.array(weightedKeywordSchema.pick({ match: true, weight: true })).default([]),
        })
        .default({}),
      salary: z
        .object({
          undisclosedScore: z.number().default(50),
          disclosedScore: z.number().default(75),
        })
        .default({}),
      sensitive: z.array(z.string()).default([]),
    })
    .default({}),
  routing: z
    .object({
      reject: z
        .object({
          fitScoreLt: z.number().optional(),
          riskScoreGt: z.number().optional(),
        })
        .default({}),
      manualReview: z
        .object({
          sensitiveKeyword: z.boolean().default(true),
          whenAny: z.array(gateRuleWhenSchema).default([]),
        })
        .default({}),
      premium: z
        .object({
          companies: z.array(z.string()).default([]),
          whenAny: z.array(gateRuleWhenSchema).default([]),
        })
        .default({}),
      aiScore: z
        .object({
          fitScoreBetween: z.tuple([z.number(), z.number()]).optional(),
          whenAny: z.array(gateRuleWhenSchema).default([]),
        })
        .default({}),
      default: z.enum(["auto", "ai_score"]).default("auto"),
    })
    .default({}),
});
export type VacancyScoring = z.infer<typeof vacancyScoringSchema>;

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

function configPaths() {
  const env = loadEnv();
  return resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
}

function readYamlOrDefault<S extends z.ZodTypeAny>(
  dataFile: string,
  defaultFile: string,
  schema: S,
): z.infer<S> {
  const file = existsSync(dataFile) ? dataFile : defaultFile;
  const raw = existsSync(file) ? parseYaml(readFileSync(file, "utf8")) : {};
  return schema.parse(raw ?? {}) as z.infer<S>;
}

/** Strategy YAML files seeded by `job-search init`. */
export const STRATEGY_FILES = [
  "search-strategy",
  "auto-apply-policy",
  "vacancy-scoring",
] as const;

export function loadSearchStrategy(): SearchStrategy {
  const p = configPaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "search-strategy.yaml"),
    path.join(p.configDefaultsDir, "search-strategy.template.yaml"),
    searchStrategySchema,
  );
}

export function loadAutoApplyPolicy(): AutoApplyPolicy {
  const p = configPaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "auto-apply-policy.yaml"),
    path.join(p.configDefaultsDir, "auto-apply-policy.template.yaml"),
    autoApplyPolicySchema,
  );
}

export function loadVacancyScoring(): VacancyScoring {
  const p = configPaths();
  return readYamlOrDefault(
    path.join(p.strategyDir, "vacancy-scoring.yaml"),
    path.join(p.configDefaultsDir, "vacancy-scoring.template.yaml"),
    vacancyScoringSchema,
  );
}

export function loadResumeTheme(): ResumeTheme {
  const p = configPaths();
  return readYamlOrDefault(
    path.join(p.resumeDir, "resume-theme.yaml"),
    path.join(p.configDefaultsDir, "resume-theme.template.yaml"),
    resumeThemeSchema,
  );
}
