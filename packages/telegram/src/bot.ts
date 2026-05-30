import { Bot } from "grammy";
import type { Logger } from "@job-search/core";
import {
  buildVacancyKeyboard,
  parseCallback,
  type InlineKeyboard,
  type VacancyAction,
} from "./keyboard.ts";

export interface BotDeps {
  getStatusText: () => string;
  getFunnelText: () => string;
  onVacancyAction: (
    action: VacancyAction,
    vacancyId: number,
  ) => Promise<{ message: string; clearKeyboard: boolean }>;
  logger?: Logger;
}

export function createBot(token: string, deps: BotDeps): Bot | null {
  if (!token) return null;
  const bot = new Bot(token);

  bot.command("status", async (ctx) => {
    await ctx.reply(deps.getStatusText());
  });
  bot.command("funnel", async (ctx) => {
    await ctx.reply(deps.getFunnelText());
  });

  bot.on("callback_query:data", async (ctx) => {
    const parsed = parseCallback(ctx.callbackQuery.data ?? "");
    if (!parsed) {
      await ctx.answerCallbackQuery({
        text: "Неизвестное действие",
        show_alert: true,
      });
      return;
    }
    try {
      const result = await deps.onVacancyAction(
        parsed.action,
        parsed.vacancyId,
      );
      if (result.clearKeyboard) {
        await ctx
          .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
          .catch(() => {});
      }
      await ctx.answerCallbackQuery({ text: result.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "action failed";
      deps.logger?.error({ error: message }, "Telegram action failed");
      await ctx.answerCallbackQuery({
        text: "Ошибка обработки",
        show_alert: true,
      });
    }
  });

  return bot;
}

export interface NotifierDeps {
  bot: Bot | null;
  chatId: string;
  logger?: Logger;
}

export interface SentMessage {
  chatId: string;
  messageId: string;
}

export function createNotifier(deps: NotifierDeps): {
  canSend: () => boolean;
  send: (text: string, vacancyId?: number) => Promise<SentMessage | null>;
  edit: (messageId: string, text: string, vacancyId?: number) => Promise<void>;
} {
  const canSend = (): boolean => Boolean(deps.bot && deps.chatId);

  const keyboardFor = (
    vacancyId?: number,
  ): { reply_markup?: InlineKeyboard } =>
    typeof vacancyId === "number"
      ? { reply_markup: buildVacancyKeyboard(vacancyId) }
      : {};

  return {
    canSend,
    send: async (text, vacancyId) => {
      if (!deps.bot || !deps.chatId) return null;
      const result = await deps.bot.api.sendMessage(deps.chatId, text, {
        ...keyboardFor(vacancyId),
        link_preview_options: { is_disabled: true },
      });
      return { chatId: deps.chatId, messageId: String(result.message_id) };
    },
    edit: async (messageId, text, vacancyId) => {
      if (!deps.bot || !deps.chatId) return;
      await deps.bot.api.editMessageText(deps.chatId, Number(messageId), text, {
        ...keyboardFor(vacancyId),
        link_preview_options: { is_disabled: true },
      });
    },
  };
}
