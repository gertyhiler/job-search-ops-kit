import type { NormalizedVacancy } from "@job-search/contracts";
import { loadAutoApplyPolicy, loadVacancyScoring } from "@job-search/core";
import type { DB } from "@job-search/db";
import {
  computeMechanicalScore,
  evaluateScoreRoute,
  evaluateVacancyGates,
} from "@job-search/scoring";

/** Vacancies rejected at score but passing gates + mechanical routing today. */
export function findRecoverableRejectedVacancyIds(db: DB): number[] {
  const scoring = loadVacancyScoring();
  const policy = loadAutoApplyPolicy();
  const gates = {
    version: scoring.version,
    defaultAction: scoring.filters.defaultAction,
    rules: scoring.filters.rules,
  };
  const blacklist = { version: scoring.version, ...scoring.filters.blacklist };

  const rows = db
    .prepare(
      `SELECT id, normalized_payload_json
       FROM vacancies
       WHERE pipeline_status = 'rejected' AND apply_mode = 'reject'`,
    )
    .all() as { id: number; normalized_payload_json: string | null }[];

  const ids: number[] = [];
  for (const row of rows) {
    if (!row.normalized_payload_json) continue;
    let v: NormalizedVacancy;
    try {
      v = JSON.parse(row.normalized_payload_json) as NormalizedVacancy;
    } catch {
      continue;
    }
    const gate = evaluateVacancyGates(v, gates, blacklist);
    if (gate.action === "reject") continue;
    const mechanical = computeMechanicalScore(v, scoring, policy);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    if (decision.route !== "reject") ids.push(row.id);
  }
  return ids.sort((a, b) => a - b);
}
