import type { NormalizedVacancy } from "@job-search/contracts";
import {
  addApplicationArtifact,
  createApplication,
  getApplicationByVacancy,
  listVacanciesByStatus,
  setVacancyStatus,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import { generateCoverLetter } from "../cover-letter.ts";
import type { PipelineContext } from "../context.ts";
import { idleReason, logStageStart, readPipelineBacklog } from "./status.ts";

export interface PackageReport {
  packaged: number;
  skipped: number;
}

export async function runPackage(
  ctx: PipelineContext,
  limit = 50,
): Promise<PackageReport> {
  const report: PackageReport = { packaged: 0, skipped: 0 };
  const rows = listVacanciesByStatus(ctx.db, "classified", limit).filter(
    (r) => r.apply_mode === "auto" || r.apply_mode === "high_value",
  );
  logStageStart(ctx, "package", { candidates: rows.length, limit });

  for (const row of rows) {
    let normalized: NormalizedVacancy;
    try {
      normalized = JSON.parse(
        row.normalized_payload_json ?? "{}",
      ) as NormalizedVacancy;
    } catch {
      report.skipped += 1;
      continue;
    }

    const existing = getApplicationByVacancy(ctx.db, row.id);
    if (existing?.cover_letter_text) {
      // Already has a letter (e.g. re-entered classified without regen): just advance.
      setVacancyStatus(ctx.db, row.id, "packaged");
      report.skipped += 1;
      continue;
    }

    const cover = await generateCoverLetter(
      { env: ctx.env, paths: ctx.paths, db: ctx.db, logger: ctx.logger },
      normalized,
    );

    const app = createApplication(ctx.db, {
      vacancyId: row.id,
      companyId: row.company_id,
      status: "packaged",
      applyMode: row.apply_mode,
      resumeVersion: "default",
      coverLetterVersion: cover.templateId,
      coverLetterText: cover.text,
    });
    addApplicationArtifact(ctx.db, {
      applicationId: app.id,
      type: "cover_letter",
      content: cover.text,
      version: cover.templateId,
    });
    setVacancyStatus(ctx.db, row.id, "packaged");
    report.packaged += 1;
    recordEvent(ctx.db, {
      type: "application_packaged",
      entityType: "vacancy",
      entityId: row.id,
      payload: {
        templateId: cover.templateId,
        usedAi: cover.usedAi,
        applyMode: row.apply_mode,
      },
    });
  }

  const backlog = readPipelineBacklog(ctx);
  ctx.logger.info(
    {
      report,
      backlog,
      idle: idleReason("package", backlog),
    },
    report.packaged > 0 ? "Package tick finished" : "Package tick idle",
  );
  return report;
}
