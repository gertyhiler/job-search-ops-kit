import {
  claimTelegramDelivery,
  getApplicationByVacancy,
  getVacancyById,
  listApplications,
  listQueue,
  listVacanciesByStatus,
  markTelegramFailed,
  markTelegramSent,
  type VacancyRow,
} from "@job-search/db";
import {
  formatAlert,
  formatVacancy,
  type VacancyNotification,
} from "@job-search/telegram";
import type { PipelineContext } from "../context.ts";

export interface NotifyReport {
  sent: number;
}

function salaryString(row: VacancyRow): string {
  if (row.salary_min === null && row.salary_max === null) return "не указана";
  const cur = row.salary_currency ?? "";
  const lo = row.salary_min ? `от ${row.salary_min}` : "";
  const hi = row.salary_max ? `до ${row.salary_max}` : "";
  return `${[lo, hi].filter(Boolean).join(" ")} ${cur}`.trim();
}

function toNotification(
  row: VacancyRow,
  coverLetter: string,
): VacancyNotification {
  const reasons = row.score_reasons_json
    ? (JSON.parse(row.score_reasons_json) as string[])
    : [];
  const risks = row.score_risks_json
    ? (JSON.parse(row.score_risks_json) as string[])
    : [];
  return {
    vacancyId: row.id,
    title: row.title,
    company: "",
    salary: salaryString(row),
    fitScore: row.fit_score,
    priorityScore: row.priority_score,
    url: row.url,
    reasons,
    risks,
    coverLetter,
  };
}

async function deliver(
  ctx: PipelineContext,
  kind: string,
  entityId: number,
  text: string,
  vacancyIdForButtons?: number,
): Promise<boolean> {
  const claim = claimTelegramDelivery(ctx.db, {
    kind,
    entityType: "vacancy",
    entityId,
    chatId: ctx.env.TELEGRAM_CHAT_ID,
  });
  if (!claim) return false;
  try {
    const sent = await ctx.notifier.send(text, vacancyIdForButtons);
    if (sent) {
      markTelegramSent(ctx.db, claim.id, sent.messageId);
      return true;
    }
    markTelegramFailed(ctx.db, claim.id, "notifier returned null");
    return false;
  } catch (error) {
    markTelegramFailed(
      ctx.db,
      claim.id,
      error instanceof Error ? error.message : "send failed",
    );
    return false;
  }
}

export async function runNotify(ctx: PipelineContext): Promise<NotifyReport> {
  const report: NotifyReport = { sent: 0 };
  if (!ctx.notifier.canSend()) {
    ctx.logger.debug("Telegram disabled; skipping notify stage");
    return report;
  }

  // 1) High-value vacancies awaiting a decision (with cover letter + buttons).
  const highValue = listVacanciesByStatus(ctx.db, "packaged", 50).filter(
    (r) => r.apply_mode === "high_value",
  );
  for (const row of highValue) {
    const app = getApplicationByVacancy(ctx.db, row.id);
    const text = formatVacancy(
      toNotification(row, app?.cover_letter_text ?? ""),
      "Вакансия на ваше решение",
    );
    if (await deliver(ctx, "vacancy_high_value", row.id, text, row.id))
      report.sent += 1;
  }

  // 2) Applied confirmations.
  for (const app of listApplications(ctx.db, 100)) {
    if (app.status !== "applied") continue;
    const row = getVacancyById(ctx.db, app.vacancy_id);
    if (!row) continue;
    const text = formatAlert(
      "✅",
      "Отклик отправлен",
      `${row.title}\n${row.url}`,
    );
    if (await deliver(ctx, "applied", row.id, text)) report.sent += 1;
  }

  // 3) Open exception queues that need a human.
  const alertQueues: Array<{
    type: Parameters<typeof listQueue>[1];
    emoji: string;
    title: string;
  }> = [
    { type: "questionnaire", emoji: "📝", title: "Нужно заполнить анкету" },
    {
      type: "auth_required",
      emoji: "🔑",
      title: "Требуется авторизация (hh:login)",
    },
    { type: "captcha_or_antibot", emoji: "🛑", title: "CAPTCHA / антибот" },
    { type: "broken_selector", emoji: "🧱", title: "Сломался плейбук отклика" },
  ];
  for (const q of alertQueues) {
    for (const item of listQueue(ctx.db, q.type, "open", 50)) {
      const row = getVacancyById(ctx.db, item.entity_id);
      const body = row
        ? `${row.title}\n${row.url}\n${item.reason ?? ""}`
        : (item.reason ?? "");
      const text = formatAlert(q.emoji, q.title, body);
      if (await deliver(ctx, `queue_${q.type}`, item.entity_id, text))
        report.sent += 1;
    }
  }

  if (report.sent > 0) ctx.logger.info({ report }, "Notify stage finished");
  return report;
}
