export interface ParsedAiModelId {
  provider: string;
  model: string;
}

export interface ResolvedAiCommand {
  command: string;
  args: string[];
  promptArgs?: string[];
  stdinPayload?: unknown;
}

export function parseAiModelId(modelId: string): ParsedAiModelId {
  const idx = modelId.indexOf(".");
  if (idx <= 0 || idx === modelId.length - 1) {
    throw new Error(
      `Invalid model id "${modelId}". Expected "{provider}.{model}" (e.g. "codex.gpt_5_2").`,
    );
  }
  const provider = modelId.slice(0, idx).trim();
  const model = modelId.slice(idx + 1).trim();
  if (!provider || !model) {
    throw new Error(
      `Invalid model id "${modelId}". Expected "{provider}.{model}".`,
    );
  }
  return { provider, model };
}

export interface ResolveAiCommandOptions {
  modelId: string;
  payload: unknown;
  jsonMode?: boolean;
}

/**
 * Map "{provider}.{model}" to a concrete CLI invocation.
 * - codex.<model>  -> `codex exec --model <model> [--json]`           (payload via stdin)
 * - cursor.<model> -> `agent --print --output-format text --model <model> --trust` (payload via argv)
 * - claude.<model> -> `claude -p --output-format text --model <model>`  (payload via argv)
 */
export function resolveAiCommandFromModelId(
  opts: ResolveAiCommandOptions,
): ResolvedAiCommand {
  const { provider, model } = parseAiModelId(opts.modelId);
  const text =
    typeof opts.payload === "string"
      ? opts.payload
      : JSON.stringify(opts.payload);

  if (provider === "codex") {
    return {
      command: "codex",
      args: ["exec", "--model", model, ...(opts.jsonMode ? ["--json"] : [])],
      stdinPayload: opts.payload,
    };
  }
  if (provider === "cursor") {
    return {
      command: "agent",
      args: ["--print", "--output-format", "text", "--model", model, "--trust"],
      promptArgs: [text],
    };
  }
  if (provider === "claude") {
    return {
      command: "claude",
      args: ["-p", "--output-format", "text", "--model", model],
      promptArgs: [text],
    };
  }
  throw new Error(
    `Unsupported AI provider "${provider}" in model id "${opts.modelId}".`,
  );
}

export function providerBinaryFor(modelId: string): string {
  const { provider } = parseAiModelId(modelId);
  if (provider === "codex") return "codex";
  if (provider === "cursor") return "agent";
  if (provider === "claude") return "claude";
  throw new Error(`Unsupported AI provider "${provider}".`);
}
