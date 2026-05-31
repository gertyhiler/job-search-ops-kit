import { describe, expect, it } from "vitest";
import { normalizedVacancySchema } from "@job-search/contracts";
import {
  autoApplyPolicySchema,
  blacklistSchema,
  vacancyGatesSchema,
  vacancyScoringSchema,
} from "@job-search/core";
import {
  computeMechanicalScore,
  evaluateApplyGate,
  evaluateScoreRoute,
  evaluateVacancyGates,
} from "@job-search/scoring";

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

describe("evaluateVacancyGates", () => {
  const gates = vacancyGatesSchema.parse({
    rules: [
      {
        id: "ban-vue",
        when: { titleContainsAny: ["vue"] },
        action: "reject",
        reason: "vue stack",
      },
      {
        id: "hybrid-no-salary",
        when: { remoteType: "hybrid", salaryDisclosed: false },
        action: "manual_review",
        reason: "hybrid, salary unknown",
      },
    ],
  });
  const blacklist = blacklistSchema.parse({ keywords: ["gambling"] });

  it("rejects blacklist keyword", () => {
    const r = evaluateVacancyGates(
      vac({ description: "react gambling" }),
      gates,
      blacklist,
    );
    expect(r.action).toBe("reject");
    expect(r.ruleId).toBe("blacklist");
  });

  it("rejects matching gate rule", () => {
    const r = evaluateVacancyGates(
      vac({ title: "Senior Vue developer" }),
      gates,
      blacklist,
    );
    expect(r.action).toBe("reject");
    expect(r.ruleId).toBe("ban-vue");
  });

  it("routes hybrid without salary to manual_review", () => {
    const r = evaluateVacancyGates(
      vac({
        title: "React dev",
        remoteType: "hybrid",
        location: "Санкт-Петербург",
      }),
      gates,
      blacklist,
    );
    expect(r.action).toBe("manual_review");
    expect(r.ruleId).toBe("hybrid-no-salary");
  });

  it("continues when no rule matches", () => {
    const r = evaluateVacancyGates(
      vac({ title: "React dev", remoteType: "remote" }),
      gates,
      blacklist,
    );
    expect(r.action).toBe("continue");
  });

  it("rejects react native via mobile-native gate", () => {
    const mobileGates = vacancyGatesSchema.parse({
      rules: [
        {
          id: "ban-mobile-native",
          when: {
            haystackContainsAny: ["react native", "react-native", "flutter"],
          },
          action: "reject",
          reason: "mobile native stack",
        },
      ],
    });
    const r = evaluateVacancyGates(
      vac({ title: "React Native Developer", remoteType: "remote" }),
      mobileGates,
      blacklist,
    );
    expect(r.action).toBe("reject");
    expect(r.ruleId).toBe("ban-mobile-native");
  });

  it("rejects java word but not javascript", () => {
    const javaGates = vacancyGatesSchema.parse({
      rules: [
        {
          id: "ban-java",
          when: { haystackWordContainsAny: ["java"] },
          action: "reject",
          reason: "java stack",
        },
      ],
    });
    expect(
      evaluateVacancyGates(
        vac({ title: "Senior Java Developer", remoteType: "remote" }),
        javaGates,
        blacklist,
      ).action,
    ).toBe("reject");
    expect(
      evaluateVacancyGates(
        vac({ title: "Senior Javascript Developer", remoteType: "remote" }),
        javaGates,
        blacklist,
      ).action,
    ).toBe("continue");
  });
});

describe("mechanical score routing", () => {
  const scoring = vacancyScoringSchema.parse({
    signals: {
      fit: {
        baseline: 30,
        keywords: [
          { match: "react", weight: 18 },
          { match: "node", weight: 14 },
        ],
        mismatch: [{ match: "devops", penalty: 25 }],
      },
      sensitive: ["relocation"],
    },
    routing: {
      reject: { fitScoreLt: 55, riskScoreGt: 40 },
      manualReview: { sensitiveKeyword: true },
      premium: {
        companies: ["BigCo"],
        whenAny: [
          {
            titleContainsAny: ["senior"],
            salaryRubGte: 400000,
          },
        ],
      },
      aiScore: { fitScoreBetween: [55, 72] },
      default: "auto",
    },
  });
  const policy = autoApplyPolicySchema.parse({});

  it("routes obvious remote react to auto", () => {
    const v = vac({
      title: "React developer",
      remoteType: "remote",
      keySkills: ["React", "TypeScript"],
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    expect(mechanical.fitScore).toBeGreaterThanOrEqual(60);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    expect(decision.route).toBe("auto");
  });

  it("does not treat react native title as web react fit boost", () => {
    const v = vac({
      title: "React Native Developer",
      remoteType: "remote",
      keySkills: ["React Native", "Expo"],
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    expect(mechanical.fitScore).toBeLessThan(55);
  });

  it("routes premium senior salary to high_value", () => {
    const v = vac({
      title: "Senior React developer",
      remoteType: "remote",
      salaryMin: 450000,
      salaryMax: 500000,
      salaryCurrency: "RUR",
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    expect(decision.route).toBe("high_value");
  });

  it("routes sensitive text to manual_review", () => {
    const v = vac({
      title: "React developer",
      description: "relocation support available",
      remoteType: "remote",
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    expect(decision.route).toBe("manual_review");
  });

  it("routes ambiguous fit to ai_score", () => {
    const v = vac({
      title: "Node developer",
      remoteType: "remote",
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    expect(mechanical.fitScore).toBeGreaterThanOrEqual(55);
    expect(mechanical.fitScore).toBeLessThanOrEqual(72);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    expect(decision.route).toBe("ai_score");
  });

  it("rejects very low mechanical fit", () => {
    const v = vac({
      title: "Software engineer",
      description: "generic role",
      remoteType: "remote",
    });
    const mechanical = computeMechanicalScore(v, scoring, policy);
    expect(mechanical.fitScore).toBe(30);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    expect(decision.route).toBe("reject");
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
});
