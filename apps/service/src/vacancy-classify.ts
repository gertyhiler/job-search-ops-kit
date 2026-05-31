import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  applyModeSchema,
  scoreResultSchema,
  type NormalizedVacancy,
  type ScoreResult,
} from "@job-search/contracts";
import {
  loadPrompt,
  promptSourcePath,
  readTextFileOr,
  runAiJson,
  type AutoApplyPolicy,
  type Env,
  type Logger,
  type Paths,
  type TargetCompanies,
} from "@job-search/core";
import { logGeneration } from "@job-search/db";
import type { DB } from "@job-search/db";

const aiClassificationSchema = z.object({
  fitScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  applyMode: applyModeSchema,
  reasons: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

function buildProfileContext(paths: Paths): string {
  const files = [
    "user-profile.md",
    "career-goals.md",
    "constraints.md",
    "compensation.md",
    "experience-facts.md",
  ];
  return files
    .map((file) => {
      const text = readTextFileOr(path.join(paths.profileDir, file), "").trim();
      if (!text) return "";
      return `## ${file}\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function salaryScoreFromVacancy(v: NormalizedVacancy): number {
  if (v.salaryMin === null && v.salaryMax === null) return 50;
  return 75;
}

function priorityScore(
  fitScore: number,
  salaryScore: number,
  riskScore: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(fitScore * 0.55 + salaryScore * 0.25 + (100 - riskScore) * 0.2),
    ),
  );
}

function isTargetCompany(v: NormalizedVacancy, target: TargetCompanies): boolean {
  const name = v.companyName.toLowerCase();
  return target.companies.some((c) => c && name.includes(c.toLowerCase()));
}

/** Clamp AI output to hard policy limits (OSS safety net). */
export function applyPolicyClamp(
  score: ScoreResult,
  policy: AutoApplyPolicy,
  target: TargetCompanies,
  v: NormalizedVacancy,
): ScoreResult {
  const risks = [...score.risks];
  let applyMode = score.applyMode;

  if (
    applyMode === "auto" &&
    isTargetCompany(v, target) &&
    score.priorityScore >= policy.highValuePriorityMin
  ) {
    applyMode = "high_value";
  }

  if (applyMode === "auto" && score.fitScore < policy.fitScoreMin) {
    applyMode = "manual_review";
    risks.push(`fit below policy minimum (${policy.fitScoreMin})`);
  }
  if (applyMode === "auto" && score.riskScore > policy.riskScoreMax) {
    applyMode = "manual_review";
    risks.push(`risk above policy maximum (${policy.riskScoreMax})`);
  }
  if (
    applyMode === "high_value" &&
    score.priorityScore < policy.highValuePriorityMin &&
    !isTargetCompany(v, target)
  ) {
    applyMode = score.fitScore >= policy.fitScoreMin ? "auto" : "manual_review";
  }

  return { ...score, applyMode, risks };
}

function fallbackScore(reason: string): ScoreResult {
  return {
    fitScore: 40,
    salaryScore: 50,
    riskScore: 30,
    priorityScore: 45,
    applyMode: "manual_review",
    reasons: [],
    risks: [reason],
  };
}

export interface ClassifyVacancyDeps {
  env: Env;
  paths: Paths;
  db: DB;
  logger?: Logger;
}

export async function classifyVacancyWithAi(
  deps: ClassifyVacancyDeps,
  vacancy: NormalizedVacancy,
  policy: AutoApplyPolicy,
  target: TargetCompanies,
): Promise<{ score: ScoreResult; usedAi: boolean }> {
  const profile = buildProfileContext(deps.paths);
  if (!profile.trim()) {
    return {
      score: fallbackScore("profile empty; classify manually after /init"),
      usedAi: false,
    };
  }

  const vacancyJson = JSON.stringify(
    {
      title: vacancy.title,
      companyName: vacancy.companyName,
      description: vacancy.description.slice(0, 8000),
      keySkills: vacancy.keySkills,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      salaryCurrency: vacancy.salaryCurrency,
      salaryGross: vacancy.salaryGross,
      location: vacancy.location,
      remoteType: vacancy.remoteType,
      schedule: vacancy.schedule,
      employment: vacancy.employment,
      experience: vacancy.experience,
      url: vacancy.url,
    },
    null,
    2,
  );

  try {
    const prompt = loadPrompt(
      "vacancy-scoring",
      {
        profile,
        policy: JSON.stringify(policy, null, 2),
        vacancy: vacancyJson,
      },
      deps.paths,
    );
    const { data, rawText, modelId, durationMs } = await runAiJson({
      modelId: deps.env.FAST_MODEL,
      prompt,
      schema: aiClassificationSchema,
      timeoutMs: deps.env.AI_TIMEOUT_MS,
      maxRetries: deps.env.AI_MAX_RETRIES,
    });

    const salaryScore = salaryScoreFromVacancy(vacancy);
    const priority = priorityScore(data.fitScore, salaryScore, data.riskScore);
    let score = scoreResultSchema.parse({
      fitScore: data.fitScore,
      salaryScore,
      riskScore: data.riskScore,
      priorityScore: priority,
      applyMode: data.applyMode,
      reasons: data.reasons,
      risks: data.risks,
    });
    score = applyPolicyClamp(score, policy, target, vacancy);

    logGeneration(deps.db, {
      type: "vacancy_scoring",
      inputHash: createHash("sha256")
        .update(vacancy.externalId)
        .digest("hex")
        .slice(0, 16),
      promptVersion: promptSourcePath("vacancy-scoring", deps.paths),
      outputText: rawText,
      model: `${modelId} (${durationMs}ms)`,
    });

    return { score, usedAi: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger?.warn(
      { error: message, vacancy: vacancy.externalId },
      "Vacancy AI classification failed; will retry on next score tick",
    );
    throw error instanceof Error ? error : new Error(message);
  }
}
