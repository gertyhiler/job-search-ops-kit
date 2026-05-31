import { describe, expect, it } from "vitest";
import {
  applyModeSchema,
  scoreResultSchema,
} from "@job-search/contracts";
import {
  autoApplyPolicySchema,
  targetCompaniesSchema,
} from "@job-search/core";
import { applyPolicyClamp } from "@job-search/service";
import { normalizedVacancySchema } from "@job-search/contracts";

describe("applyPolicyClamp", () => {
  const policy = autoApplyPolicySchema.parse({});
  const target = targetCompaniesSchema.parse({ companies: ["BigCo"] });

  it("downgrades auto when fit is below policy minimum", () => {
    const score = scoreResultSchema.parse({
      fitScore: 40,
      salaryScore: 50,
      riskScore: 10,
      priorityScore: 45,
      applyMode: "auto",
      reasons: [],
      risks: [],
    });
    const v = normalizedVacancySchema.parse({
      source: "hh",
      externalId: "1",
      url: "https://hh.ru/vacancy/1",
      title: "Dev",
      publishedAt: new Date().toISOString(),
    });
    const out = applyPolicyClamp(score, policy, target, v);
    expect(out.applyMode).toBe("manual_review");
  });

  it("rejects auto when risk exceeds policy maximum", () => {
    const score = scoreResultSchema.parse({
      fitScore: 90,
      salaryScore: 50,
      riskScore: 80,
      priorityScore: 70,
      applyMode: "auto",
      reasons: [],
      risks: [],
    });
    const v = normalizedVacancySchema.parse({
      source: "hh",
      externalId: "1",
      url: "https://hh.ru/vacancy/1",
      title: "Dev",
      publishedAt: new Date().toISOString(),
    });
    const out = applyPolicyClamp(score, policy, target, v);
    expect(out.applyMode).toBe("reject");
  });
});
