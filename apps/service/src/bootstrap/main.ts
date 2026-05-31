import { createApp } from "./app.ts";
import { acquirePipelineLock } from "./pipeline-lock.ts";

const app = createApp();
const lock = acquirePipelineLock(
  `${app.context.paths.dataDir}/.pipeline.lock`,
);

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  app.context.logger.info({ signal }, "Shutting down");
  await app.stop();
  lock.release();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.start();
