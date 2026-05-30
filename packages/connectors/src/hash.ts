import { createHash } from "node:crypto";
import type { NormalizedVacancy } from "@job-search/contracts";

/** Stable content hash used for dedupe + change detection. */
export function computeContentHash(v: NormalizedVacancy): string {
  const material = [
    v.source,
    v.externalId,
    v.title.trim(),
    (v.description ?? "").trim(),
    v.salaryMin ?? "",
    v.salaryMax ?? "",
    v.salaryCurrency ?? "",
    v.keySkills.slice().sort().join(","),
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}
