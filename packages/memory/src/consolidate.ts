import path from "node:path";
import {
  consolidationOutputSchema,
  type ConsolidationOutput,
} from "@job-search/contracts";
import {
  loadPrompt,
  readTextFileOr,
  resolvePaths,
  runAiJson,
  writeTextFile,
  type Env,
  type Logger,
} from "@job-search/core";
import {
  getFunnel,
  insertInsight,
  insertReflectionReport,
  listEventsSince,
  type DB,
} from "@job-search/db";
import { recordEvent } from "./journal.ts";
import { consolidationWindowStart } from "./triggers.ts";

export interface ConsolidationResult {
  periodStart: string;
  periodEnd: string;
  insightsWritten: number;
  resumeGapsAdded: number;
  reportPath: string;
  usedAi: boolean;
}

function countEventsByType(
  events: Array<{ type: string }>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of events) map[e.type] = (map[e.type] ?? 0) + 1;
  return map;
}

function appendResumeGaps(suggestions: string[]): number {
  if (suggestions.length === 0) return 0;
  const { profileDir } = resolvePaths();
  const file = path.join(profileDir, "resume-gaps.md");
  const existing = readTextFileOr(file, "# Resume gaps\n");
  const lines = existing.split("\n");
  const lowerExisting = existing.toLowerCase();
  let added = 0;
  for (const s of suggestions) {
    const clean = s.trim();
    if (!clean) continue;
    if (lowerExisting.includes(clean.toLowerCase())) continue;
    lines.push(`- GAP: ${clean}`);
    added += 1;
  }
  if (added > 0) writeTextFile(file, lines.join("\n"));
  return added;
}

function renderReportMarkdown(
  periodStart: string,
  periodEnd: string,
  metrics: Record<string, unknown>,
  output: ConsolidationOutput,
): string {
  const insights = output.insights
    .map(
      (i) =>
        `- **${i.kind}** (${i.confidence}): ${i.summary}${i.recommendation ? ` → ${i.recommendation}` : ""}`,
    )
    .join("\n");
  const recs = output.recommendations.map((r) => `- ${r}`).join("\n");
  const gaps = output.resumeGapSuggestions.map((g) => `- ${g}`).join("\n");
  return [
    `# Consolidation report`,
    `Period: ${periodStart} → ${periodEnd}`,
    "",
    "## Metrics",
    "```json",
    JSON.stringify(metrics, null, 2),
    "```",
    "",
    "## Insights",
    insights || "_none_",
    "",
    "## Recommendations",
    recs || "_none_",
    "",
    "## Resume gap suggestions",
    gaps || "_none_",
  ].join("\n");
}

/**
 * Deterministic consolidation: fixed inputs (events + funnel for a fixed window),
 * a single bounded AI reasoning step with a strict schema, and fixed outputs
 * (reflection report + insights + resume-gap suggestions). Runs as its own
 * process so the interactive agent never has to think about it.
 */
export async function runConsolidation(
  db: DB,
  env: Env,
  logger?: Logger,
): Promise<ConsolidationResult> {
  const paths = resolvePaths();
  const periodEnd = new Date().toISOString();
  const periodStart = consolidationWindowStart(db);

  const events = listEventsSince(db, periodStart, 2000);
  const funnel = getFunnel(db);
  const eventsByType = countEventsByType(events);
  const metrics: Record<string, unknown> = {
    windowStart: periodStart,
    windowEnd: periodEnd,
    totalEvents: events.length,
    eventsByType,
    funnel,
  };

  const sample = events.slice(-120).map((e) => ({
    ts: e.created_at,
    type: e.type,
    entityType: e.entity_type,
    entityId: e.entity_id,
    payload: e.payload_json ? safeParse(e.payload_json) : null,
  }));

  let output: ConsolidationOutput = {
    insights: [],
    resumeGapSuggestions: [],
    metrics: {},
    recommendations: [],
  };
  let usedAi = false;

  try {
    const prompt = loadPrompt("reflection", {
      window_start: periodStart,
      window_end: periodEnd,
      metrics_json: JSON.stringify(metrics),
      events_json: JSON.stringify(sample),
    });
    const result = await runAiJson({
      modelId: env.REASONING_MODEL,
      prompt,
      schema: consolidationOutputSchema,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
    });
    output = result.data;
    usedAi = true;
  } catch (error) {
    logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Consolidation AI step failed; writing metrics-only report",
    );
  }

  const reportMarkdown = renderReportMarkdown(
    periodStart,
    periodEnd,
    metrics,
    output,
  );

  insertReflectionReport(db, {
    periodStart,
    periodEnd,
    reportMarkdown,
    metrics,
    recommendations: output.recommendations,
  });

  for (const insight of output.insights) {
    insertInsight(db, {
      kind: insight.kind,
      summary: insight.summary,
      detail: insight.detail,
      recommendation: insight.recommendation,
      confidence: insight.confidence,
      periodStart,
      periodEnd,
    });
  }

  const dateSlug = periodEnd.slice(0, 10);
  const reportPath = path.join(
    paths.reportsDir,
    `${dateSlug}-consolidation.md`,
  );
  writeTextFile(reportPath, reportMarkdown);
  writeTextFile(path.join(paths.insightsDir, `${dateSlug}.md`), reportMarkdown);

  const resumeGapsAdded = appendResumeGaps(output.resumeGapSuggestions);

  recordEvent(db, {
    type: "consolidation_completed",
    entityType: "reflection",
    entityId: null,
    payload: {
      periodStart,
      periodEnd,
      insights: output.insights.length,
      usedAi,
    },
  });

  return {
    periodStart,
    periodEnd,
    insightsWritten: output.insights.length,
    resumeGapsAdded,
    reportPath,
    usedAi,
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
