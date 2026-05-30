export interface VacancyNotification {
  vacancyId: number;
  title: string;
  company: string;
  salary: string;
  fitScore: number | null;
  priorityScore: number | null;
  url: string;
  reasons: string[];
  risks: string[];
  coverLetter: string;
}

export function formatVacancy(
  n: VacancyNotification,
  heading = "Новая вакансия",
): string {
  const reasons = n.reasons.length
    ? n.reasons.map((r) => `• ${r}`).join("\n")
    : "• —";
  const risks = n.risks.length
    ? n.risks.map((r) => `• ${r}`).join("\n")
    : "• —";
  return [
    `🧩 ${heading}`,
    `${n.title} — ${n.company || "?"}`,
    `Зарплата: ${n.salary}`,
    `Fit: ${n.fitScore ?? "—"} | Priority: ${n.priorityScore ?? "—"}`,
    n.url,
    "",
    "Почему подходит:",
    reasons,
    "",
    "Риски:",
    risks,
    "",
    "Сопроводительное письмо:",
    n.coverLetter || "—",
  ].join("\n");
}

export function formatSummary(
  title: string,
  lines: Array<[string, string | number]>,
): string {
  return [`📊 ${title}`, ...lines.map(([k, v]) => `${k}: ${v}`)].join("\n");
}

export function formatAlert(
  emoji: string,
  title: string,
  body: string,
): string {
  return [`${emoji} ${title}`, body].filter(Boolean).join("\n");
}
