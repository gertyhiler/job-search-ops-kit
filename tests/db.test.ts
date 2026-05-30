import { describe, expect, it } from "vitest";
import { normalizedVacancySchema } from "@job-search/contracts";
import { computeContentHash } from "@job-search/connectors";
import {
  createApplication,
  enqueue,
  getFunnel,
  listVacanciesByStatus,
  logEvent,
  openAndMigrate,
  upsertCompany,
  upsertVacancy,
} from "@job-search/db";

function vac() {
  return normalizedVacancySchema.parse({
    source: "hh",
    externalId: "100",
    url: "https://hh.ru/vacancy/100",
    title: "React dev",
    description: "react typescript",
    companyName: "Acme",
    publishedAt: new Date().toISOString(),
  });
}

describe("db layer", () => {
  it("migrates, upserts, dedupes, and reports a funnel", () => {
    const db = openAndMigrate(":memory:");
    const company = upsertCompany(db, { source: "hh", name: "Acme" });
    const v = vac();
    const hash = computeContentHash(v);

    const first = upsertVacancy(db, v, company.id, hash);
    expect(first.isNew).toBe(true);

    const second = upsertVacancy(db, v, company.id, hash);
    expect(second.isNew).toBe(false);
    expect(second.changed).toBe(false);

    expect(listVacanciesByStatus(db, "normalized").length).toBe(1);

    createApplication(db, {
      vacancyId: first.id,
      companyId: company.id,
      status: "packaged",
    });
    enqueue(db, {
      type: "manual_review",
      entityType: "vacancy",
      entityId: first.id,
      reason: "test",
    });
    logEvent(db, {
      type: "vacancy_discovered",
      entityType: "vacancy",
      entityId: first.id,
    });

    const funnel = getFunnel(db);
    expect(funnel.vacanciesByStatus.normalized).toBe(1);
    expect(funnel.applicationsByStatus.packaged).toBe(1);
    expect(funnel.queuesByType.manual_review).toBe(1);
    db.close();
  });
});
