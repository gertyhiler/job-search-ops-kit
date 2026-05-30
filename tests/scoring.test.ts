import { describe, expect, it } from "vitest";
import { normalizedVacancySchema } from "@job-search/contracts";
import {
  autoApplyPolicySchema,
  blacklistSchema,
  manualReviewPolicySchema,
  targetCompaniesSchema,
} from "@job-search/core";
import {
  evaluateApplyGate,
  scoreVacancy,
  type ScoringContext,
} from "@job-search/scoring";

const ctx: ScoringContext = {
  autoApplyPolicy: autoApplyPolicySchema.parse({}),
  manualReviewPolicy: manualReviewPolicySchema.parse({}),
  blacklist: blacklistSchema.parse({}),
  targetCompanies: targetCompaniesSchema.parse({ companies: ["BigCo"] }),
};

function vac(overrides: Record<string, unknown>) {
  return normalizedVacancySchema.parse({
    source: "hh",
    externalId: "1",
    url: "https://hh.ru/vacancy/1",
    title: "Frontend developer",
    description: "",
    publishedAt: new Date().toISOString(),
    ...overrides,
  });
}

describe("scoreVacancy", () => {
  it("scores a strong React/TS role as auto", () => {
    const r = scoreVacancy(
      vac({
        title: "Senior React developer",
        description: "react typescript next.js",
      }),
      ctx,
    );
    expect(r.fitScore).toBeGreaterThan(60);
    expect(r.applyMode).toBe("auto");
  });

  it("rejects gambling roles via risk", () => {
    const r = scoreVacancy(
      vac({ description: "react gambling casino betting" }),
      ctx,
    );
    expect(r.riskScore).toBeGreaterThan(40);
    expect(r.applyMode).toBe("reject");
  });

  it("escalates target companies to high_value", () => {
    const r = scoreVacancy(
      vac({ description: "react typescript", companyName: "BigCo" }),
      ctx,
    );
    expect(r.applyMode).toBe("high_value");
  });
});

describe("evaluateApplyGate", () => {
  const policy = autoApplyPolicySchema.parse({});
  it("allows a clean auto vacancy", () => {
    const g = evaluateApplyGate({
      policy,
      applyMode: "auto",
      fitScore: 80,
      riskScore: 10,
      alreadyApplied: false,
      applicationsToday: 0,
      applicationsToCompanyLast30Days: 0,
      playbookStatus: "active",
    });
    expect(g.allowed).toBe(true);
  });

  it("routes manual_review classification away from auto", () => {
    const g = evaluateApplyGate({
      policy,
      applyMode: "manual_review",
      fitScore: 90,
      riskScore: 0,
      alreadyApplied: false,
      applicationsToday: 0,
      applicationsToCompanyLast30Days: 0,
      playbookStatus: "active",
    });
    expect(g.allowed).toBe(false);
    expect(g.route).toBe("manual_review");
  });

  it("blocks when daily limit is hit", () => {
    const g = evaluateApplyGate({
      policy,
      applyMode: "auto",
      fitScore: 80,
      riskScore: 0,
      alreadyApplied: false,
      applicationsToday: policy.maxAutoApplicationsPerDay,
      applicationsToCompanyLast30Days: 0,
      playbookStatus: "active",
    });
    expect(g.allowed).toBe(false);
  });
});
