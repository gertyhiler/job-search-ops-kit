import { parseVacancyPageHtml } from "./parse-vacancy-page.ts";
import type { HhWebVacancyWithDetail } from "./hh-search.ts";

function extractLuxInitialStateJson(html: string): unknown {
  const marker = 'id="HH-Lux-InitialState"';
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error("HH initial state marker not found");

  const start = html.indexOf(">", idx);
  if (start < 0) throw new Error("HH initial state start not found");

  const end = html.indexOf("</template>", start);
  if (end < 0) throw new Error("HH initial state end not found");

  const jsonText = html.slice(start + 1, end).trim();
  if (!jsonText) throw new Error("HH initial state JSON is empty");
  return JSON.parse(jsonText) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Fetch a single HH vacancy page over HTTP and map it into the same web/shards shape
 * the connector pipeline already understands.
 *
 * This is used for manual one-off imports (e.g. user pasted a vacancy URL).
 */
export async function fetchHhVacancyByUrl(
  url: string,
): Promise<HhWebVacancyWithDetail> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      // HH blocks/serves degraded content for some default agents.
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ru,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch vacancy page: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const state = extractLuxInitialStateJson(html);
  const root = asRecord(state);
  if (!root) throw new Error("HH initial state is not an object");

  const vacancyView = asRecord(root.vacancyView);
  const analyticsParams = asRecord(root.analyticsParams);
  const vacancyId =
    readNumber(vacancyView?.vacancyId) ??
    readNumber(analyticsParams?.vacancyId) ??
    null;
  if (!vacancyId) throw new Error("Failed to resolve vacancyId from HH state");

  const statuses = asRecord(root.applicantVacancyResponseStatuses);
  const statusForId = asRecord(statuses?.[String(vacancyId)]);
  const shortVacancy = asRecord(statusForId?.shortVacancy);

  const name =
    (typeof shortVacancy?.name === "string" ? shortVacancy.name : null) ??
    (typeof vacancyView?.name === "string" ? vacancyView.name : null) ??
    "";
  if (!name) throw new Error("Failed to resolve vacancy name");

  const companyFromShort = asRecord(shortVacancy?.company);
  const companyFromView = asRecord(vacancyView?.company);
  const company =
    companyFromShort ??
    companyFromView ??
    null;

  const areaFromShort = asRecord(shortVacancy?.area);
  const areaFromView = asRecord(vacancyView?.area);
  const area =
    areaFromShort ??
    areaFromView ??
    null;

  const compensationFromShort = asRecord(shortVacancy?.compensation);
  const compensationFromView = asRecord(vacancyView?.compensation);
  const compensation =
    compensationFromShort ??
    compensationFromView ??
    null;

  const detail = parseVacancyPageHtml(html);

  return {
    vacancyId,
    name,
    company: company
      ? {
          id: readNumber(company.id) ?? undefined,
          name: typeof company.name === "string" ? company.name : undefined,
        }
      : undefined,
    compensation:
      compensation && !("noCompensation" in compensation)
        ? {
            from: readNumber(compensation.from),
            to: readNumber(compensation.to),
            currencyCode:
              typeof compensation.currencyCode === "string"
                ? compensation.currencyCode
                : null,
            gross:
              typeof compensation.gross === "boolean" ? compensation.gross : null,
          }
        : undefined,
    publicationTime:
      shortVacancy && asRecord(shortVacancy.publicationTime)
        ? (shortVacancy.publicationTime as { $?: string; "@timestamp"?: number })
        : undefined,
    area: area
      ? {
          "@id": readNumber(area["@id"]) ?? undefined,
          name: typeof area.name === "string" ? area.name : undefined,
        }
      : undefined,
    "@workSchedule":
      typeof shortVacancy?.["@workSchedule"] === "string"
        ? (shortVacancy["@workSchedule"] as string)
        : undefined,
    workExperience:
      typeof shortVacancy?.workExperience === "string"
        ? (shortVacancy.workExperience as string)
        : undefined,
    employment:
      shortVacancy && asRecord(shortVacancy.employment)
        ? ({ "@type": (shortVacancy.employment as any)["@type"] } as {
            "@type"?: string;
          })
        : undefined,
    detail: {
      ...(detail.description ? { description: detail.description } : {}),
      ...(detail.keySkills ? { keySkills: detail.keySkills } : {}),
    },
  };
}

