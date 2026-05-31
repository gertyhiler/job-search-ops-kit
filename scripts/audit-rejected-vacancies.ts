/**
 * Re-evaluate rejected vacancies against current gate + mechanical routing rules.
 * Usage: npx tsx scripts/audit-rejected-vacancies.ts
 */
import type { NormalizedVacancy } from "@job-search/contracts";
import {
  loadAutoApplyPolicy,
  loadEnv,
  loadVacancyScoring,
  resolvePaths,
  type VacancyScoring,
} from "@job-search/core";
import { openDb } from "@job-search/db";
import {
  computeMechanicalScore,
  evaluateScoreRoute,
  evaluateVacancyGates,
  type GateResult,
} from "@job-search/scoring";

function isSpb(location: string | null): boolean {
  const loc = (location ?? "").toLowerCase();
  return (
    loc.includes("санкт-петербург") ||
    loc.includes("petersburg") ||
    loc.includes("спб")
  );
}

/** User-stated location policy (for comparison with stored gate outcome). */
function locationPolicyVerdict(v: NormalizedVacancy): {
  allowed: boolean;
  reason: string;
} {
  if (v.remoteType === "remote" || v.remoteType === "unknown") {
    return { allowed: true, reason: "remote/unknown — allowed anywhere" };
  }
  if (v.remoteType === "hybrid") {
    if (!isSpb(v.location)) {
      return { allowed: false, reason: "hybrid outside SPb" };
    }
    const disclosed = v.salaryMin !== null || v.salaryMax !== null;
    if (!disclosed) {
      return { allowed: true, reason: "hybrid SPb, salary undisclosed" };
    }
    const amount = v.salaryMax ?? v.salaryMin;
    const cur = (v.salaryCurrency ?? "RUR").toUpperCase();
    if (amount !== null && (cur === "RUR" || cur === "RUB") && amount >= 350_000) {
      return { allowed: true, reason: "hybrid SPb, salary >= 350k" };
    }
    if (amount !== null && (cur === "RUR" || cur === "RUB") && amount < 350_000) {
      return { allowed: false, reason: "hybrid SPb, salary below 350k" };
    }
    return { allowed: true, reason: "hybrid SPb, salary in non-RUB/unclear — pass" };
  }
  if (v.remoteType === "onsite") {
    return { allowed: false, reason: "onsite — not in scope" };
  }
  return { allowed: true, reason: "fallback allow" };
}

function parseVacancy(json: string | null): NormalizedVacancy | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as NormalizedVacancy;
  } catch {
    return null;
  }
}

function gateFromScoring(scoring: VacancyScoring) {
  return {
    version: scoring.version,
    defaultAction: scoring.filters.defaultAction,
    rules: scoring.filters.rules,
  };
}

function blacklistFromScoring(scoring: VacancyScoring) {
  return { version: scoring.version, ...scoring.filters.blacklist };
}

interface Row {
  id: number;
  pipeline_status: string;
  apply_mode: string | null;
  remote_type: string | null;
  location: string | null;
  title: string;
  normalized_payload_json: string | null;
  gate_rule: string | null;
}

function main(): void {
  const env = loadEnv();
  const paths = resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH });
  const db = openDb(paths.dbPath);
  const scoring = loadVacancyScoring();
  const policy = loadAutoApplyPolicy();
  const gates = gateFromScoring(scoring);
  const blacklist = blacklistFromScoring(scoring);

  const rows = db
    .prepare(
      `SELECT v.id, v.pipeline_status, v.apply_mode, v.remote_type, v.location, v.title,
              v.normalized_payload_json,
              (SELECT json_extract(e.payload_json, '$.ruleId')
               FROM events e
               WHERE e.entity_id = v.id AND e.type = 'vacancy_gate_rejected'
               LIMIT 1) AS gate_rule
       FROM vacancies v
       WHERE v.pipeline_status = 'rejected'
       ORDER BY v.id`,
    )
    .all() as unknown as Row[];

  const stats = {
    total: rows.length,
    parseFailed: 0,
    gateRejectNow: 0,
    gatePassNow: 0,
    /** Gate rejected before but passes location policy + would pass non-location gates */
    wronglyGateRejectedLocation: 0,
    /** Passed gate re-eval; mechanical route is not reject */
    wouldScoreNotReject: 0,
    wouldRouteAuto: 0,
    wouldRouteAi: 0,
    wouldRouteManual: 0,
    wouldRouteHighValue: 0,
    /** Was score-rejected (apply_mode=reject) but mechanical says not reject */
    scoreRejectRecoverable: 0,
    byOldGateRule: new Map<string, number>(),
    byNewGateRule: new Map<string, number>(),
    byRemoteType: new Map<string, { gatePass: number; gateReject: number }>(),
    recoverableIds: [] as number[],
  };

  for (const row of rows) {
    if (row.gate_rule) {
      stats.byOldGateRule.set(
        row.gate_rule,
        (stats.byOldGateRule.get(row.gate_rule) ?? 0) + 1,
      );
    }

    const v = parseVacancy(row.normalized_payload_json);
    if (!v) {
      stats.parseFailed += 1;
      continue;
    }

    const gate: GateResult = evaluateVacancyGates(v, gates, blacklist);
    const loc = locationPolicyVerdict(v);

    const rt = v.remoteType;
    const rtStats = stats.byRemoteType.get(rt) ?? { gatePass: 0, gateReject: 0 };

    if (gate.action === "reject") {
      stats.gateRejectNow += 1;
      rtStats.gateReject += 1;
      stats.byNewGateRule.set(
        gate.ruleId ?? "unknown",
        (stats.byNewGateRule.get(gate.ruleId ?? "unknown") ?? 0) + 1,
      );

      // Wrong location gate: location policy allows but gate rejects on location rule
      if (
        loc.allowed &&
        row.gate_rule &&
        (row.gate_rule === "onsite-not-spb" ||
          row.gate_rule === "hybrid-not-spb" ||
          row.gate_rule === "hybrid-spb-below-floor")
      ) {
        stats.wronglyGateRejectedLocation += 1;
        stats.recoverableIds.push(row.id);
      }
    } else {
      stats.gatePassNow += 1;
      rtStats.gatePass += 1;

      const mechanical = computeMechanicalScore(v, scoring, policy);
      const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
      const route =
        decision.route === "reject"
          ? "reject"
          : decision.route === "auto"
            ? "auto"
            : decision.route === "ai_score"
              ? "ai_score"
              : decision.route === "high_value"
                ? "high_value"
                : "manual_review";

      if (route !== "reject") {
        stats.wouldScoreNotReject += 1;
        stats.recoverableIds.push(row.id);

        if (row.apply_mode === "reject" || row.apply_mode === null) {
          if (row.apply_mode === "reject") stats.scoreRejectRecoverable += 1;
        }
      }

      switch (route) {
        case "auto":
          stats.wouldRouteAuto += 1;
          break;
        case "ai_score":
          stats.wouldRouteAi += 1;
          break;
        case "high_value":
          stats.wouldRouteHighValue += 1;
          break;
        default:
          stats.wouldRouteManual += 1;
      }
    }
    stats.byRemoteType.set(rt, rtStats);
  }

  console.log("=== Rejected vacancy audit ===\n");
  console.log(`Total rejected: ${stats.total}`);
  console.log(`Parse failed: ${stats.parseFailed}`);
  console.log(`Pass gates now: ${stats.gatePassNow}`);
  console.log(`Fail gates now: ${stats.gateRejectNow}`);
  console.log(
    `\nWrongly gate-rejected on location (policy allows, old location rule blocked): ${stats.wronglyGateRejectedLocation}`,
  );
  console.log(`Would pass gates + not mechanical-reject: ${stats.wouldScoreNotReject}`);
  console.log(`  → route auto: ${stats.wouldRouteAuto}`);
  console.log(`  → route ai_score: ${stats.wouldRouteAi}`);
  console.log(`  → route high_value: ${stats.wouldRouteHighValue}`);
  console.log(`  → route manual_review: ${stats.wouldRouteManual}`);
  console.log(
    `Score-rejected before but mechanical not-reject now: ${stats.scoreRejectRecoverable}`,
  );

  console.log("\n--- Old gate reject rule (from events) ---");
  for (const [rule, n] of [...stats.byOldGateRule.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${rule}: ${n}`);
  }

  console.log("\n--- New gate reject rule (re-eval) ---");
  for (const [rule, n] of [...stats.byNewGateRule.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${rule}: ${n}`);
  }

  console.log("\n--- By remote_type (gate pass / reject on re-eval) ---");
  for (const [rt, s] of [...stats.byRemoteType.entries()].sort()) {
    console.log(`  ${rt}: pass=${s.gatePass} reject=${s.gateReject}`);
  }

  // Sample recoverable score-rejected remote
  console.log("\n--- Sample: gate-pass remote previously score-rejected (up to 15) ---");
  let shown = 0;
  for (const row of rows) {
    if (shown >= 15) break;
    if (row.apply_mode !== "reject" || row.remote_type !== "remote") continue;
    const v = parseVacancy(row.normalized_payload_json);
    if (!v) continue;
    const gate = evaluateVacancyGates(v, gates, blacklist);
    if (gate.action === "reject") continue;
    const mechanical = computeMechanicalScore(v, scoring, policy);
    const decision = evaluateScoreRoute(v, scoring, mechanical, policy);
    if (decision.route === "reject") continue;
    console.log(
      `  #${row.id} fit=${mechanical.fitScore} risk=${mechanical.riskScore} → ${decision.route} | ${row.title.slice(0, 70)}`,
    );
    shown += 1;
  }

  // Misclassified onsite with remote signals
  console.log("\n--- Onsite gate-rejected but text suggests remote (up to 15) ---");
  shown = 0;
  for (const row of rows) {
    if (shown >= 15) break;
    if (row.gate_rule !== "onsite-not-spb") continue;
    const v = parseVacancy(row.normalized_payload_json);
    if (!v) continue;
    const text =
      `${v.title} ${v.description} ${v.schedule ?? ""}`.toLowerCase();
    if (
      !text.includes("удал") &&
      !text.includes("remote") &&
      !text.includes("дистанц")
    )
      continue;
    console.log(
      `  #${row.id} loc=${v.location} schedule=${v.schedule} | ${row.title.slice(0, 70)}`,
    );
    shown += 1;
  }

  db.close();
}

main();
