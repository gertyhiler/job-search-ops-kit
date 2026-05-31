import { requeueScoreFailures, requeueStuckApplying, requeueFailedAutoApplies } from "@job-search/db";
import type { PipelineContext } from "../context.ts";

export interface RetryFailedReport {
  scoreFailures: number;
  stuckApplying: number;
  failedApplies: number;
}

/** Requeue work that failed transiently so the next pipeline tick can retry it. */
export function runRetryFailed(ctx: PipelineContext): RetryFailedReport {
  const scoreFailures = requeueScoreFailures(ctx.db);
  const stuckApplying = requeueStuckApplying(ctx.db);
  const failedApplies = requeueFailedAutoApplies(ctx.db);
  if (scoreFailures || stuckApplying || failedApplies) {
    ctx.logger.info(
      { scoreFailures, stuckApplying, failedApplies },
      "Requeued failed pipeline work",
    );
  }
  return { scoreFailures, stuckApplying, failedApplies };
}
