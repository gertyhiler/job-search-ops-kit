import { describe, expect, it } from "vitest";
import { normalizedVacancySchema } from "@job-search/contracts";
import {
  autoApplyPolicySchema,
  blacklistSchema,
  vacancyGatesSchema,
} from "@job-search/core";
import { evaluateApplyGate, evaluateVacancyGates } from "@job-search/scoring";

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
