export type HookPlatform = "cursor" | "codex" | "unknown";

/** Detect host from hook stdin JSON (Cursor vs Codex). */
export function detectHookPlatform(input: unknown): HookPlatform {
  if (!input || typeof input !== "object") return "unknown";
  const o = input as Record<string, unknown>;
  const event =
    typeof o.hook_event_name === "string"
      ? o.hook_event_name
      : typeof o.hookEventName === "string"
        ? o.hookEventName
        : "";
  if (event === "SessionStart") return "codex";
  if ("composer_mode" in o || "is_background_agent" in o) return "cursor";
  if (typeof o.source === "string" && /^(startup|resume|clear)$/.test(o.source))
    return "codex";
  return "unknown";
}

/** Prefix for injected session context (user-profile only). */
export function formatUserProfileContext(content: string): string {
  const body = content.trim();
  if (!body) return "";
  return [
    "## Candidate profile (user-profile)",
    "",
    "Loaded via read_profile at session start. Use for positioning; verify facts in experience-facts/evidence before claims in applications.",
    "",
    body,
  ].join("\n");
}

/** Stdout JSON for session-start context injection. */
export function buildHookStdout(
  platform: HookPlatform,
  additionalContext: string,
): string {
  const ctx = additionalContext.trim();
  if (!ctx) return "";

  if (platform === "codex") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ctx,
      },
    });
  }

  // Cursor and unknown: Cursor sessionStart uses additional_context
  return JSON.stringify({ additional_context: ctx });
}

export function extractUserProfile(readProfileResult: unknown): string {
  if (!readProfileResult || typeof readProfileResult !== "object") return "";
  const o = readProfileResult as Record<string, unknown>;
  const raw = o["user-profile"];
  return typeof raw === "string" ? raw.trim() : "";
}
