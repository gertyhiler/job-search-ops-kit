/** Compare stored scores vs re-computed mechanical scores for rejected vacancies. */
import type { NormalizedVacancy } from "@job-search/contracts";
import { loadAutoApplyPolicy, loadEnv, loadVacancyScoring, resolvePaths } from "@job-search/core";
import { openDb } from "@job-search/db";
import {
  computeMechanicalScore,
  evaluateScoreRoute,
  evaluateVacancyGates,
} from "@job-search/scoring";

const env = loadEnv();
const paths = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
const db = openDb(paths.dbPath);
const scoring = loadVacancyScoring();
const policy = loadAutoApplyPolicy();
const gates = {
  version: scoring.version,
  defaultAction: scoring.filters.defaultAction,
  rules: scoring.filters.rules,
};
const blacklist = { version: scoring.version, ...scoring.filters.blacklist };

type Row = {
  id: number;
  apply_mode: string | null;
  fit_score: number | null;
  risk_score: number | null;
  remote_type: string | null;
  normalized_payload_json: string;
  gate_rule: string | null;
};

const rows = db
  .prepare(
    `SELECT v.id, v.apply_mode, v.fit_score, v.risk_score, v.remote_type,
            v.normalized_payload_json,
            (SELECT json_extract(e.payload_json, '$.ruleId')
             FROM events e WHERE e.entity_id = v.id AND e.type = 'vacancy_gate_rejected' LIMIT 1) AS gate_rule
     FROM vacancies v WHERE v.pipeline_status = 'rejected'`,
  )
  .all() as Row[];

let gateRecover = 0;
let scoreRecoverMechanical = 0;
let scoreRecoverAuto = 0;
let scoreRecoverAi = 0;
let storedRejectButMechPass = 0;
let fitScoreDrift = 0;

for (const row of rows) {
  const v = JSON.parse(row.normalized_payload_json) as NormalizedVacancy;
  const gate = evaluateVacancyGates(v, gates, blacklist);
  const mech = computeMechanicalScore(v, scoring, policy);
  const route = evaluateScoreRoute(v, scoring, mech, policy);

  if (row.gate_rule && gate.action !== "reject") gateRecover += 1;

  if (row.apply_mode === "reject") {
    if (Math.abs((row.fit_score ?? 0) - mech.fitScore) > 5) fitScoreDrift += 1;
    if (route.route !== "reject") {
      scoreRecoverMechanical += 1;
      if (route.route === "auto") scoreRecoverAuto += 1;
      if (route.route === "ai_score") scoreRecoverAi += 1;
    }
    if (route.route !== "reject" && gate.action !== "reject") storedRejectButMechPass += 1;
  }
}

console.log({
  totalRejected: rows.length,
  gateRejectedStored: rows.filter((r) => r.gate_rule).length,
  wouldPassGateNow: gateRecover,
  scoreRejectedStored: rows.filter((r) => r.apply_mode === "reject").length,
  scoreRejectButMechNotReject: scoreRecoverMechanical,
  wouldRouteAuto: scoreRecoverAuto,
  wouldRouteAi: scoreRecoverAi,
  storedVsMechFitDriftGt5: fitScoreDrift,
  recoverableGateAndScore: storedRejectButMechPass,
});

db.close();
