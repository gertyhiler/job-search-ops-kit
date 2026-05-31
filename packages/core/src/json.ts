/**
 * Extract the first balanced JSON object/array from arbitrary CLI output.
 * AI CLIs often wrap JSON in prose or code fences; this pulls the JSON out.
 */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const haystack = fenced?.[1] ?? text;

  for (let i = 0; i < haystack.length; i += 1) {
    const ch = haystack[i];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < haystack.length; j += 1) {
      const c = haystack[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return haystack.slice(i, j + 1);
      }
    }
  }
  return null;
}

export function parseJsonLoose<T = unknown>(text: string): T {
  const extracted = extractJson(text);
  if (!extracted) {
    throw new Error(
      `No JSON found in output. First 200 chars: ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(extracted) as T;
}

/** Parse structured JSON from AI CLI output (plain JSON, fences, or codex NDJSON). */
export function parseAiJsonOutput<T = unknown>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty AI output");
  }

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as {
          type?: string;
          item?: { type?: string; text?: string };
        };
        if (
          event.type === "item.completed" &&
          event.item?.type === "agent_message" &&
          typeof event.item.text === "string"
        ) {
          return parseJsonLoose<T>(event.item.text);
        }
      } catch {
        // not a codex event line
      }
    }
  }

  return parseJsonLoose<T>(text);
}
