import cron from "node-cron";
import type { Logger } from "@job-search/core";

export interface QueueSchedulerDeps {
  name: string;
  task: () => Promise<void>;
  intervalSec: number;
  logger?: Logger;
}

export interface QueueScheduler {
  start: () => void;
  stop: () => void;
  trigger: () => Promise<void>;
  waitForIdle: () => Promise<void>;
}

function intervalToCronExpression(intervalSec: number): string {
  if (intervalSec < 60) {
    return `*/${Math.max(1, intervalSec)} * * * * *`;
  }
  const minutes = Math.max(1, Math.floor(intervalSec / 60));
  return `*/${minutes} * * * *`;
}

export function createQueueScheduler(deps: QueueSchedulerDeps): QueueScheduler {
  const logger = deps.logger;
  const expression = intervalToCronExpression(deps.intervalSec);

  let running = false;
  let pending = false;
  let stopped = false;
  let currentRun: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        await deps.task();
      } while (pending && !stopped);
    } finally {
      running = false;
      currentRun = null;
    }
  };

  const trigger = async (): Promise<void> => {
    if (stopped) return;
    if (running) {
      pending = true;
      return currentRun ?? Promise.resolve();
    }
    currentRun = drain();
    await currentRun;
  };

  const task = cron.schedule(
    expression,
    async () => {
      try {
        await trigger();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "scheduler failure";
        logger?.error(
          { error: message, queue: deps.name },
          "Queue tick failed",
        );
      }
    },
    { scheduled: false },
  );

  return {
    start: () => {
      stopped = false;
      task.start();
      logger?.info({ expression, queue: deps.name }, "Queue scheduler started");
    },
    stop: () => {
      stopped = true;
      task.stop();
      logger?.info({ queue: deps.name }, "Queue scheduler stopped");
    },
    trigger,
    waitForIdle: async () => {
      while (currentRun) {
        await currentRun;
      }
    },
  };
}

export function createCronScheduler(
  expression: string,
  task: () => Promise<void>,
  logger?: Logger,
  name = "cron",
): QueueScheduler {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      logger?.error(
        { error: error instanceof Error ? error.message : String(error), name },
        "Cron task failed",
      );
    } finally {
      running = false;
    }
  };
  const job = cron.schedule(expression, run, { scheduled: false });
  return {
    start: () => job.start(),
    stop: () => job.stop(),
    trigger: run,
    waitForIdle: async () => {},
  };
}
