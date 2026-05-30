export type VacancyAction = "approve" | "skip" | "regen" | "applied";

export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export function buildVacancyKeyboard(vacancyId: number): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Откликнуться", callback_data: `approve:${vacancyId}` },
        { text: "⏭ Пропустить", callback_data: `skip:${vacancyId}` },
      ],
      [
        { text: "♻️ Переписать письмо", callback_data: `regen:${vacancyId}` },
        { text: "✔️ Уже откликнулся", callback_data: `applied:${vacancyId}` },
      ],
    ],
  };
}

export function parseCallback(
  data: string,
): { action: VacancyAction; vacancyId: number } | null {
  const match = /^(approve|skip|regen|applied):(\d+)$/.exec(data);
  if (!match) return null;
  return { action: match[1] as VacancyAction, vacancyId: Number(match[2]) };
}
