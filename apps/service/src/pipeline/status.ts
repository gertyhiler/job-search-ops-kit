import { loadAutoApplyPolicy } from "@job-search/core";
import { countVacancies, getFunnel } from "@job-search/db";
import type { PipelineContext } from "../context.ts";

export interface PipelineBacklog {
  normalized: number;
  classifiedAuto: number;
  packagedAuto: number;
  openQueues: number;
}

export function readPipelineBacklog(ctx: PipelineContext): PipelineBacklog {
  const funnel = getFunnel(ctx.db);
  const openQueues = Object.values(funnel.queuesByType).reduce((a, b) => a + b, 0);
  return {
    normalized: countVacancies(ctx.db, { status: "normalized" }),
    classifiedAuto: countVacancies(ctx.db, {
      status: "classified",
      applyMode: "auto",
    }),
    packagedAuto: countVacancies(ctx.db, {
      status: "packaged",
      applyMode: "auto",
    }),
    openQueues,
  };
}

/** One-line system snapshot for logs / heartbeat. */
export function logPipelineStatus(
  ctx: PipelineContext,
  event: string,
  extra?: Record<string, unknown>,
): void {
  const funnel = getFunnel(ctx.db);
  const backlog = readPipelineBacklog(ctx);
  const policy = loadAutoApplyPolicy();
  ctx.logger.info(
    {
      event,
      mode: ctx.env.AUTO_APPLY_MODE,
      policyMode: policy.mode,
      backlog,
      vacancies: funnel.vacanciesByStatus,
      queues: funnel.queuesByType,
      applications: funnel.applicationsByStatus,
      ...extra,
    },
    describePipelineState(backlog, policy.mode),
  );
}

function describePipelineState(
  backlog: PipelineBacklog,
  policyMode: string,
): string {
  const parts: string[] = [];
  if (backlog.normalized > 0) {
    parts.push(`${backlog.normalized} awaiting score`);
  }
  if (backlog.classifiedAuto > 0) {
    parts.push(`${backlog.classifiedAuto} ready to package`);
  }
  if (backlog.packagedAuto > 0) {
    parts.push(`${backlog.packagedAuto} ready to apply`);
  }
  if (backlog.openQueues > 0) {
    parts.push(`${backlog.openQueues} open queue items`);
  }
  if (parts.length === 0) {
    return `Pipeline idle (${policyMode}); no work in auto-apply queues`;
  }
  return `Pipeline: ${parts.join("; ")}`;
}

export function logStageStart(
  ctx: PipelineContext,
  stage: string,
  extra?: Record<string, unknown>,
): void {
  ctx.logger.info(
    { stage, backlog: readPipelineBacklog(ctx), ...extra },
    `${stage} tick started`,
  );
}

export function idleReason(
  stage: string,
  backlog: PipelineBacklog,
): string | null {
  switch (stage) {
    case "package":
      return backlog.classifiedAuto === 0
        ? "no classified auto vacancies"
        : null;
    case "apply":
      return backlog.packagedAuto === 0 ? "no packaged auto vacancies" : null;
    case "score":
      return backlog.normalized === 0 ? "no normalized vacancies" : null;
    default:
      return null;
  }
}
