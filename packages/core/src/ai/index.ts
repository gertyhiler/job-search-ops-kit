import type { z } from "zod";
import { parseAiJsonOutput } from "../json.ts";
import { resolveAiCommandFromModelId } from "./command-adapter.ts";
import { runAiCommand } from "./runner.ts";

export * from "./command-adapter.ts";
export * from "./runner.ts";

export interface RunAiOptions {
  modelId: string;
  prompt: string;
  timeoutMs?: number;
  maxRetries?: number;
  jsonMode?: boolean;
}

export interface AiTextResult {
  text: string;
  modelId: string;
  durationMs: number;
}

export async function runAiText(opts: RunAiOptions): Promise<AiTextResult> {
  const resolved = resolveAiCommandFromModelId({
    modelId: opts.modelId,
    payload: opts.prompt,
    jsonMode: opts.jsonMode,
  });
  const result = await runAiCommand({
    command: resolved.command,
    args: resolved.args,
    promptArgs: resolved.promptArgs,
    stdinPayload: resolved.stdinPayload,
    timeoutMs: opts.timeoutMs ?? 120_000,
    maxRetries: opts.maxRetries ?? 1,
  });
  return {
    text: result.stdout,
    modelId: opts.modelId,
    durationMs: result.durationMs,
  };
}

export interface AiJsonResult<T> {
  data: T;
  rawText: string;
  modelId: string;
  durationMs: number;
}

export async function runAiJson<S extends z.ZodTypeAny>(
  opts: RunAiOptions & { schema: S },
): Promise<AiJsonResult<z.infer<S>>> {
  const { text, durationMs } = await runAiText({
    ...opts,
    jsonMode: opts.jsonMode ?? true,
  });
  const parsed = parseAiJsonOutput(text);
  const data = opts.schema.parse(parsed) as z.infer<S>;
  return { data, rawText: text, modelId: opts.modelId, durationMs };
}
