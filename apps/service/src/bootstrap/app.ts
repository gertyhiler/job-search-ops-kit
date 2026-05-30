import { shutdownActiveAiCommands } from "@job-search/core";
import { runConsolidation, shouldConsolidate } from "@job-search/memory";
import { createContext, type PipelineContext } from "../context.ts";
import {
  runApply,
  runNotify,
  runPackage,
  runScore,
  runSearch,
  sendDailySummary,
  sendWeeklySummary,
} from "../pipeline/index.ts";
import {
  createCronScheduler,
  createQueueScheduler,
  type QueueScheduler,
} from "../scheduler.ts";

export interface App {
  context: PipelineContext;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  runOnce: () => Promise<void>;
}

export function createApp(context = createContext()): App {
  const { env, logger, db } = context;
  const downstream = Math.min(env.POLL_INTERVAL_SEC, 30);

  const maintenanceTick = async (): Promise<void> => {
    if (shouldConsolidate(db, env.CONSOLIDATION_EVENT_THRESHOLD)) {
      logger.info("Consolidation trigger reached; running consolidation");
      await runConsolidation(db, env, logger);
    }
  };

  const queues: QueueScheduler[] = [
    createQueueScheduler({
      name: "search",
      intervalSec: env.POLL_INTERVAL_SEC,
      logger,
      task: () => runSearch(context).then(() => {}),
    }),
    createQueueScheduler({
      name: "score",
      intervalSec: downstream,
      logger,
      task: () => runScore(context).then(() => {}),
    }),
    createQueueScheduler({
      name: "package",
      intervalSec: downstream,
      logger,
      task: () => runPackage(context).then(() => {}),
    }),
    createQueueScheduler({
      name: "apply",
      intervalSec: downstream,
      logger,
      task: () => runApply(context).then(() => {}),
    }),
    createQueueScheduler({
      name: "notify",
      intervalSec: downstream,
      logger,
      task: () => runNotify(context).then(() => {}),
    }),
    createQueueScheduler({
      name: "maintenance",
      intervalSec: Math.max(downstream, 60),
      logger,
      task: maintenanceTick,
    }),
  ];

  const dailySummary = createCronScheduler(
    "0 9 * * *",
    () => sendDailySummary(context),
    logger,
    "daily-summary",
  );
  const weeklySummary = createCronScheduler(
    "0 10 * * 0",
    () => sendWeeklySummary(context),
    logger,
    "weekly-summary",
  );
  const weeklyConsolidation = createCronScheduler(
    "0 23 * * 0",
    () => runConsolidation(db, env, logger).then(() => {}),
    logger,
    "weekly-consolidation",
  );

  const crons = [dailySummary, weeklySummary, weeklyConsolidation];

  return {
    context,
    start: async () => {
      logger.info(
        { mode: env.AUTO_APPLY_MODE, downstream },
        "Starting pipeline",
      );
      if (context.bot) {
        context.bot
          .start({ onStart: () => logger.info("Telegram bot started") })
          .catch((error) => {
            logger.error(
              { error: error instanceof Error ? error.message : String(error) },
              "Telegram bot crashed",
            );
          });
      } else {
        logger.info("Telegram disabled (no TELEGRAM_BOT_TOKEN)");
      }

      for (const q of queues) q.start();
      for (const c of crons) c.start();
      // Kick each queue once so the first cycle runs immediately.
      for (const q of queues) void q.trigger();
    },
    stop: async () => {
      for (const q of queues) q.stop();
      for (const c of crons) c.stop();
      await shutdownActiveAiCommands();
      await Promise.all(queues.map((q) => q.waitForIdle()));
      if (context.bot) await context.bot.stop();
      db.close();
      logger.info("Pipeline stopped");
    },
    runOnce: async () => {
      await runSearch(context);
      await runScore(context);
      await runPackage(context);
      await runApply(context);
      await runNotify(context);
    },
  };
}
