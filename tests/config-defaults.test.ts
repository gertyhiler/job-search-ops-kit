import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  autoApplyPolicySchema,
  searchStrategySchema,
  STRATEGY_FILES,
  vacancyScoringSchema,
} from "@job-search/core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultsDir = path.join(repoRoot, "config/defaults");

const schemaByStrategy = {
  "search-strategy": searchStrategySchema,
  "auto-apply-policy": autoApplyPolicySchema,
  "vacancy-scoring": vacancyScoringSchema,
} as const;

describe("config default templates", () => {
  it("seeds exactly the strategy files init expects", () => {
    expect(STRATEGY_FILES).toEqual([
      "search-strategy",
      "auto-apply-policy",
      "vacancy-scoring",
    ]);
    for (const name of STRATEGY_FILES) {
      const file = path.join(defaultsDir, `${name}.template.yaml`);
      expect(() =>
        schemaByStrategy[name].parse(parseYaml(readFileSync(file, "utf8"))),
      ).not.toThrow();
    }
  });

  it("vacancy-scoring template has filters, signals, and routing", () => {
    const raw = parseYaml(
      readFileSync(
        path.join(defaultsDir, "vacancy-scoring.template.yaml"),
        "utf8",
      ),
    );
    const scoring = vacancyScoringSchema.parse(raw);
    expect(scoring.filters.rules.length).toBeGreaterThan(0);
    expect(scoring.signals.fit.keywords.length).toBeGreaterThan(0);
    expect(scoring.routing.default).toBe("auto");
  });
});
