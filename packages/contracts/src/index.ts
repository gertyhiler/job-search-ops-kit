import { z } from "zod";

/** A job board / source identifier, e.g. "hh". */
export type Source = string;

export const capabilitySchema = z.enum(["api", "scrape", "rss"]);
export type Capability = z.infer<typeof capabilitySchema>;

/** Remote arrangement, normalized across sources. */
export const remoteTypeSchema = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);
export type RemoteType = z.infer<typeof remoteTypeSchema>;

/** A raw, source-specific payload. Adapters know how to read it. */
export type RawVacancy = Record<string, unknown>;

export const normalizedVacancySchema = z.object({
  source: z.string().min(1),
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string().default(""),
  companyName: z.string().default(""),
  companyExternalId: z.string().nullable().default(null),
  keySkills: z.array(z.string()).default([]),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  salaryCurrency: z.string().nullable().default(null),
  salaryGross: z.boolean().nullable().default(null),
  location: z.string().nullable().default(null),
  remoteType: remoteTypeSchema.default("unknown"),
  schedule: z.string().nullable().default(null),
  employment: z.string().nullable().default(null),
  experience: z.string().nullable().default(null),
  publishedAt: z.string(),
  raw: z.record(z.unknown()).default({}),
});
export type NormalizedVacancy = z.infer<typeof normalizedVacancySchema>;

/** The single interface every board connector implements. */
export interface JobSourceAdapter {
  source: Source;
  capabilities: Capability[];
  /** Fetch raw items published after `since` (null = first run). */
  fetchNewJobs(since: Date | null): Promise<RawVacancy[]>;
  /** Validate + map a raw item into a NormalizedVacancy. */
  normalize(raw: RawVacancy): NormalizedVacancy;
}

/** Lifecycle status on the vacancies table. */
export const pipelineStatusSchema = z.enum([
  "normalized",
  "scored",
  "classified",
  "packaged",
  "applying",
  "applied",
  "failed",
  "queued",
  "rejected",
]);
export type PipelineStatus = z.infer<typeof pipelineStatusSchema>;

/** How a vacancy should be handled after scoring. */
export const applyModeSchema = z.enum([
  "auto",
  "manual_review",
  "high_value",
  "reject",
]);
export type ApplyMode = z.infer<typeof applyModeSchema>;

export const queueTypeSchema = z.enum([
  "auto_apply",
  "manual_review",
  "questionnaire",
  "auth_required",
  "captcha_or_antibot",
  "broken_selector",
  "high_value",
  "suspicious",
  "hr_reply",
  "interview_prep",
]);
export type QueueType = z.infer<typeof queueTypeSchema>;

export const applyErrorTypeSchema = z.enum([
  "already_applied",
  "resume_required",
  "cover_letter_field_missing",
  "questionnaire_required",
  "auth_required",
  "captcha_or_antibot",
  "selector_broken",
  "network_error",
  "unknown_error",
]);
export type ApplyErrorType = z.infer<typeof applyErrorTypeSchema>;

export const scoreResultSchema = z.object({
  fitScore: z.number().min(0).max(100),
  salaryScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  priorityScore: z.number().min(0).max(100),
  applyMode: applyModeSchema,
  reasons: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;

/** Result of one Playwright apply attempt. */
export const applyOutcomeSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["applied", "dry_run_ok", "failed", "queued"]),
  errorType: applyErrorTypeSchema.nullable().default(null),
  queueType: queueTypeSchema.nullable().default(null),
  message: z.string().default(""),
  screenshotPath: z.string().nullable().default(null),
  tracePath: z.string().nullable().default(null),
});
export type ApplyOutcome = z.infer<typeof applyOutcomeSchema>;

/** A consolidation insight (memory). */
export const insightSchema = z.object({
  kind: z.enum([
    "resume_gap",
    "filter_too_strict",
    "filter_too_loose",
    "what_converts",
    "template_performance",
    "general",
  ]),
  summary: z.string().min(1),
  detail: z.string().default(""),
  recommendation: z.string().default(""),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Insight = z.infer<typeof insightSchema>;

export const consolidationOutputSchema = z.object({
  insights: z.array(insightSchema).default([]),
  resumeGapSuggestions: z.array(z.string()).default([]),
  metrics: z.record(z.unknown()).default({}),
  recommendations: z.array(z.string()).default([]),
});
export type ConsolidationOutput = z.infer<typeof consolidationOutputSchema>;

/** JSON-Resume-ish master record. */
export const resumeSchema = z.object({
  basics: z
    .object({
      name: z.string().default(""),
      label: z.string().default(""),
      email: z.string().default(""),
      phone: z.string().default(""),
      location: z
        .object({
          city: z.string().default(""),
          countryCode: z.string().default(""),
        })
        .default({ city: "", countryCode: "" }),
      summary: z.string().default(""),
      profiles: z
        .array(z.object({ network: z.string(), url: z.string() }))
        .default([]),
    })
    .default({}),
  work: z
    .array(
      z.object({
        company: z.string().default(""),
        position: z.string().default(""),
        startDate: z.string().default(""),
        endDate: z.string().default(""),
        location: z.string().default(""),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  skills: z
    .array(
      z.object({ name: z.string(), keywords: z.array(z.string()).default([]) }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string().default(""),
        area: z.string().default(""),
        studyType: z.string().default(""),
        startDate: z.string().default(""),
        endDate: z.string().default(""),
      }),
    )
    .default([]),
  languages: z
    .array(z.object({ language: z.string(), fluency: z.string().default("") }))
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().default(""),
        description: z.string().default(""),
        url: z.string().default(""),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type Resume = z.infer<typeof resumeSchema>;
