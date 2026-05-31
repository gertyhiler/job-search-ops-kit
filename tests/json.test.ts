import { describe, expect, it } from "vitest";
import { extractJson, parseAiJsonOutput, parseJsonLoose } from "@job-search/core";

describe("extractJson", () => {
  it("pulls JSON out of prose", () => {
    expect(extractJson('blah {"a":1} trailing')).toBe('{"a":1}');
  });
  it("handles code fences", () => {
    expect(parseJsonLoose('```json\n{"letter":"hi"}\n```')).toEqual({
      letter: "hi",
    });
  });
  it("ignores braces inside strings", () => {
    expect(parseJsonLoose('{"x":"a}b"}')).toEqual({ x: "a}b" });
  });
});

describe("parseAiJsonOutput", () => {
  it("extracts JSON from codex NDJSON stream", () => {
    const codex = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"letter\\":\\"Привет\\",\\"usedFacts\\":[\\"fact\\"]}"}}',
    ].join("\n");
    expect(parseAiJsonOutput(codex)).toEqual({
      letter: "Привет",
      usedFacts: ["fact"],
    });
  });
});
