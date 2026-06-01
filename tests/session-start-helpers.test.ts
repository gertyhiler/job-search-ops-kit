import { describe, expect, it } from "vitest";
import {
  buildHookStdout,
  detectHookPlatform,
  extractUserProfile,
  formatUserProfileContext,
} from "../scripts/hooks/session-start-helpers.ts";

describe("detectHookPlatform", () => {
  it("detects Cursor sessionStart input", () => {
    expect(
      detectHookPlatform({
        session_id: "x",
        composer_mode: "agent",
        is_background_agent: false,
      }),
    ).toBe("cursor");
  });

  it("detects Codex SessionStart input", () => {
    expect(
      detectHookPlatform({
        hook_event_name: "SessionStart",
        source: "startup",
      }),
    ).toBe("codex");
  });
});

describe("buildHookStdout", () => {
  it("emits additional_context for Cursor", () => {
    const out = JSON.parse(buildHookStdout("cursor", "hello")) as {
      additional_context: string;
    };
    expect(out.additional_context).toBe("hello");
  });

  it("emits hookSpecificOutput for Codex", () => {
    const out = JSON.parse(buildHookStdout("codex", "hello")) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toBe("hello");
  });

  it("returns empty when profile is empty", () => {
    expect(buildHookStdout("cursor", "  ")).toBe("");
  });
});

describe("extractUserProfile", () => {
  it("reads user-profile key from read_profile result", () => {
    expect(
      extractUserProfile({
        "user-profile": "  Senior engineer  ",
        evidence: "x",
      }),
    ).toBe("Senior engineer");
  });
});

describe("formatUserProfileContext", () => {
  it("wraps non-empty profile", () => {
    expect(formatUserProfileContext("Bio")).toContain("## Candidate profile");
    expect(formatUserProfileContext("Bio")).toContain("Bio");
  });

  it("returns empty for blank profile", () => {
    expect(formatUserProfileContext("   ")).toBe("");
  });
});
