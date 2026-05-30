import {
  getApplicationByVacancy,
  getVacancyById,
  setVacancyStatus,
  updateApplicationStatus,
  type DB,
} from "@job-search/db";
import { recordEvent } from "@job-search/memory";
import type { VacancyAction } from "@job-search/telegram";

export interface ActionResult {
  message: string;
  clearKeyboard: boolean;
}

/** Handle an inline-button action coming from Telegram. */
export function handleVacancyAction(
  db: DB,
  action: VacancyAction,
  vacancyId: number,
): ActionResult {
  const vacancy = getVacancyById(db, vacancyId);
  if (!vacancy) return { message: "Вакансия не найдена", clearKeyboard: true };

  switch (action) {
    case "approve": {
      db.prepare(
        `UPDATE vacancies SET apply_mode = 'auto', pipeline_status = 'packaged', updated_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), vacancyId);
      recordEvent(db, {
        type: "user_approved_apply",
        entityType: "vacancy",
        entityId: vacancyId,
      });
      return { message: "Поставлено в очередь на отклик", clearKeyboard: true };
    }
    case "skip": {
      setVacancyStatus(db, vacancyId, "rejected");
      recordEvent(db, {
        type: "user_skipped",
        entityType: "vacancy",
        entityId: vacancyId,
      });
      return { message: "Пропущено", clearKeyboard: true };
    }
    case "regen": {
      const app = getApplicationByVacancy(db, vacancyId);
      if (app) {
        db.prepare(
          `UPDATE applications SET cover_letter_text = NULL, updated_at = ? WHERE id = ?`,
        ).run(new Date().toISOString(), app.id);
      }
      setVacancyStatus(db, vacancyId, "classified");
      recordEvent(db, {
        type: "user_requested_regen",
        entityType: "vacancy",
        entityId: vacancyId,
      });
      return { message: "Перегенерирую письмо", clearKeyboard: false };
    }
    case "applied": {
      const app = getApplicationByVacancy(db, vacancyId);
      if (app) {
        updateApplicationStatus(db, app.id, {
          status: "applied",
          appliedAt: new Date().toISOString(),
          result: "manual",
        });
      }
      setVacancyStatus(db, vacancyId, "applied");
      recordEvent(db, {
        type: "user_marked_applied",
        entityType: "vacancy",
        entityId: vacancyId,
      });
      return { message: "Отмечено как отклик отправлен", clearKeyboard: true };
    }
    default:
      return { message: "Неизвестное действие", clearKeyboard: true };
  }
}
