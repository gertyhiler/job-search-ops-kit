import { getFunnel, listEventsSince } from "@job-search/db";
import { formatSummary } from "@job-search/telegram";
import type { PipelineContext } from "../context.ts";

function countByType(events: Array<{ type: string }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of events) map[e.type] = (map[e.type] ?? 0) + 1;
  return map;
}

export function buildSummaryText(
  ctx: PipelineContext,
  sinceIso: string,
  title: string,
): string {
  const events = listEventsSince(ctx.db, sinceIso, 5000);
  const byType = countByType(events);
  const funnel = getFunnel(ctx.db);
  const lines: Array<[string, string | number]> = [
    ["discovered", byType.vacancy_discovered ?? 0],
    ["scored", byType.vacancy_scored ?? 0],
    ["packaged", byType.application_packaged ?? 0],
    ["applied", byType.application_applied ?? 0],
    ["dry_run", byType.application_dry_run ?? 0],
    ["failed", byType.application_failed ?? 0],
    ["queue.manual_review", funnel.queuesByType.manual_review ?? 0],
    ["queue.questionnaire", funnel.queuesByType.questionnaire ?? 0],
    ["queue.high_value", funnel.queuesByType.high_value ?? 0],
  ];
  return formatSummary(title, lines);
}

export async function sendDailySummary(ctx: PipelineContext): Promise<void> {
  if (!ctx.notifier.canSend()) return;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  await ctx.notifier.send(
    buildSummaryText(ctx, since.toISOString(), "Daily summary"),
  );
}

export async function sendWeeklySummary(ctx: PipelineContext): Promise<void> {
  if (!ctx.notifier.canSend()) return;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await ctx.notifier.send(
    buildSummaryText(ctx, since.toISOString(), "Weekly summary"),
  );
}
