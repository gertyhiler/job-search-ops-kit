import { applyToVacancy } from "@job-search/browser";
import {
  loadAutoApplyPolicy,
  hhPlaywrightProfileFromEnv,
} from "@job-search/core";
import {
  countApplicationsSince,
  countApplicationsToCompanySince,
  enqueue,
  ensurePlaybook,
  getApplicationByVacancy,
  listVacanciesByStatus,
  recordPlaybookFailure,
  recordPlaybookSuccess,
  setPlaybookStatus,
  setVacancyStatus,
  updateApplicationStatus,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import { evaluateApplyGate } from "@job-search/scoring";
import type { PipelineContext } from "../context.ts";

export interface ApplyReport {
  attempted: number;
  applied: number;
  dryRun: number;
  failed: number;
  queued: number;
  skipped: number;
}

const startOfTodayIso = (): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};
const thirtyDaysAgoIso = (): string =>
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

export async function runApply(
  ctx: PipelineContext,
  limit = 50,
): Promise<ApplyReport> {
  const policy = loadAutoApplyPolicy();
  const report: ApplyReport = {
    attempted: 0,
    applied: 0,
    dryRun: 0,
    failed: 0,
    queued: 0,
    skipped: 0,
  };

  const playbook = ensurePlaybook(ctx.db, "hh", "apply");
  const playbookReady = ["dry_run", "tested", "active"].includes(
    playbook.status,
  );
  const envReal = ctx.env.AUTO_APPLY_MODE === "real" && policy.mode === "real";

  const rows = listVacanciesByStatus(ctx.db, "packaged", limit).filter(
    (r) => r.apply_mode === "auto",
  );
  let applicationsToday = countApplicationsSince(ctx.db, startOfTodayIso(), [
    "applied",
    "dry_run",
  ]);

  for (const row of rows) {
    const app = getApplicationByVacancy(ctx.db, row.id);
    if (!app) {
      report.skipped += 1;
      continue;
    }

    const toCompany = row.company_id
      ? countApplicationsToCompanySince(
          ctx.db,
          row.company_id,
          thirtyDaysAgoIso(),
        )
      : 0;

    const gate = evaluateApplyGate({
      policy,
      applyMode: row.apply_mode,
      fitScore: row.fit_score,
      riskScore: row.risk_score,
      alreadyApplied: app.status === "applied",
      applicationsToday,
      applicationsToCompanyLast30Days: toCompany,
      playbookStatus: playbook.status,
    });

    if (!gate.allowed) {
      if (gate.route === "manual_review") {
        enqueue(ctx.db, {
          type: "manual_review",
          entityType: "vacancy",
          entityId: row.id,
          reason: gate.reason,
        });
        setVacancyStatus(ctx.db, row.id, "queued");
      } else {
        setVacancyStatus(ctx.db, row.id, "rejected");
      }
      report.skipped += 1;
      recordEvent(ctx.db, {
        type: "apply_gate_blocked",
        entityType: "vacancy",
        entityId: row.id,
        payload: { reason: gate.reason },
      });
      continue;
    }

    // Safety: a new playbook must pass a dry-run before any real submission.
    const mode: "dry_run" | "real" =
      envReal && playbookReady ? "real" : "dry_run";

    setVacancyStatus(ctx.db, row.id, "applying");
    updateApplicationStatus(ctx.db, app.id, { status: "applying" });
    report.attempted += 1;

    const outcome = await applyToVacancy({
      url: row.url,
      vacancyId: row.id,
      coverLetter: app.cover_letter_text ?? "",
      mode,
      storageStatePath: ctx.paths.storageStatePath,
      screenshotsDir: ctx.paths.screenshotsDir,
      tracesDir: ctx.paths.tracesDir,
      headless: true,
      profile: hhPlaywrightProfileFromEnv(ctx.env),
    });

    if (outcome.status === "applied") {
      updateApplicationStatus(ctx.db, app.id, {
        status: "applied",
        appliedAt: new Date().toISOString(),
        result: "real",
      });
      setVacancyStatus(ctx.db, row.id, "applied");
      recordPlaybookSuccess(ctx.db, playbook.id);
      if (playbook.status !== "active")
        setPlaybookStatus(ctx.db, playbook.id, "active");
      applicationsToday += 1;
      report.applied += 1;
      recordEvent(ctx.db, {
        type: "application_applied",
        entityType: "vacancy",
        entityId: row.id,
        payload: { url: row.url },
      });
    } else if (outcome.status === "dry_run_ok") {
      updateApplicationStatus(ctx.db, app.id, {
        status: "dry_run",
        result: "dry_run",
      });
      setVacancyStatus(ctx.db, row.id, "applied");
      if (playbook.status === "draft")
        setPlaybookStatus(ctx.db, playbook.id, "dry_run");
      applicationsToday += 1;
      report.dryRun += 1;
      recordEvent(ctx.db, {
        type: "application_dry_run",
        entityType: "vacancy",
        entityId: row.id,
        payload: { screenshot: outcome.screenshotPath },
      });
    } else if (
      outcome.status === "queued" &&
      outcome.errorType === "already_applied"
    ) {
      updateApplicationStatus(ctx.db, app.id, {
        status: "already_applied",
        result: "already_applied",
      });
      setVacancyStatus(ctx.db, row.id, "applied");
      report.queued += 1;
      recordEvent(ctx.db, {
        type: "application_already_applied",
        entityType: "vacancy",
        entityId: row.id,
      });
    } else {
      // failed
      if (outcome.queueType) {
        enqueue(ctx.db, {
          type: outcome.queueType,
          entityType: "vacancy",
          entityId: row.id,
          reason: outcome.message,
          payload: {
            screenshot: outcome.screenshotPath,
            trace: outcome.tracePath,
            errorType: outcome.errorType,
          },
        });
      }
      updateApplicationStatus(ctx.db, app.id, {
        status: "failed",
        failureReason: outcome.errorType ?? "unknown_error",
      });
      setVacancyStatus(ctx.db, row.id, "queued");
      report.failed += 1;

      if (
        outcome.errorType === "selector_broken" ||
        outcome.errorType === "network_error"
      ) {
        const disabled = recordPlaybookFailure(
          ctx.db,
          playbook.id,
          policy.maxFailedAttemptsPerPlaybookBeforeDisable,
        );
        if (disabled) {
          recordEvent(ctx.db, {
            type: "playbook_broken",
            entityType: "playbook",
            entityId: playbook.id,
            payload: { source: "hh", type: "apply" },
          });
        }
      }
      recordEvent(ctx.db, {
        type: "application_failed",
        entityType: "vacancy",
        entityId: row.id,
        payload: {
          errorType: outcome.errorType,
          queue: outcome.queueType,
          screenshot: outcome.screenshotPath,
        },
      });
    }
  }

  ctx.logger.info(
    { report, mode: envReal ? "real-eligible" : "dry_run" },
    "Apply stage finished",
  );
  return report;
}
