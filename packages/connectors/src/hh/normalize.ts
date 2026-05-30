import {
  normalizedVacancySchema,
  type NormalizedVacancy,
  type RemoteType,
} from "@job-search/contracts";
import type { HhVacancyDetail } from "./client.ts";

function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRemoteType(scheduleId: string | undefined): RemoteType {
  switch (scheduleId) {
    case "remote":
      return "remote";
    case "flexible":
    case "shift":
      return "hybrid";
    case "fullDay":
      return "onsite";
    default:
      return "unknown";
  }
}

export function normalizeHhVacancy(detail: HhVacancyDetail): NormalizedVacancy {
  const description =
    stripHtml(detail.description) ||
    [
      stripHtml(detail.snippet?.responsibility),
      stripHtml(detail.snippet?.requirement),
    ]
      .filter(Boolean)
      .join(" ");

  const keySkills = (detail.key_skills ?? [])
    .map((k) => k.name)
    .filter(Boolean);
  const location = detail.area?.name ?? null;

  return normalizedVacancySchema.parse({
    source: "hh",
    externalId: String(detail.id),
    url: detail.alternate_url,
    title: detail.name,
    description,
    companyName: detail.employer?.name ?? "",
    companyExternalId: detail.employer?.id ?? null,
    keySkills,
    salaryMin: detail.salary?.from ?? null,
    salaryMax: detail.salary?.to ?? null,
    salaryCurrency: detail.salary?.currency ?? null,
    salaryGross: detail.salary?.gross ?? null,
    location,
    remoteType: mapRemoteType(detail.schedule?.id),
    schedule: detail.schedule?.name ?? null,
    employment: detail.employment?.name ?? null,
    experience: detail.experience?.name ?? null,
    publishedAt: detail.published_at,
    raw: detail as unknown as Record<string, unknown>,
  });
}
