import pino, { type Logger } from "pino";

export type { Logger };

export function createLogger(name: string, level = "info"): Logger {
  const usePretty =
    process.stdout.isTTY && process.env.NODE_ENV !== "production";
  return pino({
    name,
    level,
    ...(usePretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });
}
