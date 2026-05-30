import type { HhWebVacancyWithDetail } from "@job-search/browser";
import type { HhVacancyDetail } from "./client.ts";

const EXPERIENCE_LABELS: Record<string, string> = {
  noExperience: "Нет опыта",
  between1And3: "1–3 года",
  between3And6: "3–6 лет",
  moreThan6: "Более 6 лет",
};

const SCHEDULE_LABELS: Record<string, string> = {
  remote: "Удалённая работа",
  flexible: "Гибкий график",
  fullDay: "Полный день",
  shift: "Сменный график",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL: "Полная занятость",
  PART: "Частичная занятость",
  PROJECT: "Проектная работа",
  FLY_IN_FLY_OUT: "Вахта",
};

function label(
  map: Record<string, string>,
  id: string | undefined,
): string | undefined {
  if (!id) return undefined;
  return map[id] ?? id;
}

/** Map a web/shards vacancy (+ optional scraped detail) to the legacy API shape. */
export function mapWebToHhDetail(web: HhWebVacancyWithDetail): HhVacancyDetail {
  const scheduleId = web["@workSchedule"];
  const experienceId = web.workExperience;
  const employmentId = web.employment?.["@type"];
  const publishedAt = web.publicationTime?.$ ?? new Date().toISOString();

  return {
    id: String(web.vacancyId),
    name: web.name,
    alternate_url: `https://hh.ru/vacancy/${web.vacancyId}`,
    published_at: publishedAt,
    area: web.area
      ? {
          id: web.area["@id"] != null ? String(web.area["@id"]) : undefined,
          name: web.area.name,
        }
      : undefined,
    employer: web.company
      ? {
          id: web.company.id != null ? String(web.company.id) : undefined,
          name: web.company.name,
        }
      : undefined,
    salary: web.compensation
      ? {
          from: web.compensation.from ?? null,
          to: web.compensation.to ?? null,
          currency: web.compensation.currencyCode ?? null,
          gross: web.compensation.gross ?? null,
        }
      : null,
    schedule: scheduleId
      ? {
          id: scheduleId,
          name: label(SCHEDULE_LABELS, scheduleId),
        }
      : null,
    employment: employmentId
      ? {
          id: employmentId,
          name: label(EMPLOYMENT_LABELS, employmentId),
        }
      : null,
    experience: experienceId
      ? {
          id: experienceId,
          name: label(EXPERIENCE_LABELS, experienceId),
        }
      : null,
    description: web.detail?.description,
    key_skills: (web.detail?.keySkills ?? []).map((name) => ({ name })),
  };
}
