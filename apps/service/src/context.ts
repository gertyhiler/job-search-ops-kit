import {
  createLogger,
  loadEnv,
  resolvePaths,
  type Env,
  type Logger,
  type Paths,
} from "@job-search/core";
import { getFunnel, openAndMigrate, type DB } from "@job-search/db";
import { createBot, createNotifier, formatSummary } from "@job-search/telegram";
import type { Bot } from "grammy";
import { handleVacancyAction } from "./actions.ts";

export interface PipelineContext {
  env: Env;
  logger: Logger;
  db: DB;
  paths: Paths;
  bot: Bot | null;
  notifier: ReturnType<typeof createNotifier>;
}

export function createContext(): PipelineContext {
  const env = loadEnv();
  const logger = createLogger("pipeline", env.LOG_LEVEL);
  const paths = resolvePaths({
    dataDir: env.DATA_DIR,
    dbPath: env.DATABASE_PATH,
  });
  const db = openAndMigrate(paths.dbPath);

  const funnelText = (): string => {
    const f = getFunnel(db);
    return formatSummary("Funnel", [
      ...Object.entries(f.vacanciesByStatus).map(
        ([k, v]) => [`vacancy.${k}`, v] as [string, number],
      ),
      ...Object.entries(f.applicationsByStatus).map(
        ([k, v]) => [`app.${k}`, v] as [string, number],
      ),
      ...Object.entries(f.queuesByType).map(
        ([k, v]) => [`queue.${k}`, v] as [string, number],
      ),
    ]);
  };

  const bot = createBot(env.TELEGRAM_BOT_TOKEN, {
    getStatusText: () => `mode=${env.AUTO_APPLY_MODE}`,
    getFunnelText: funnelText,
    onVacancyAction: async (action, vacancyId) =>
      handleVacancyAction(db, action, vacancyId),
    logger,
  });

  const notifier = createNotifier({
    bot,
    chatId: env.TELEGRAM_CHAT_ID,
    logger,
  });

  return { env, logger, db, paths, bot, notifier };
}
