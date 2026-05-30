import { describe, expect, it } from "vitest";
import { extractJson, parseJsonLoose } from "@job-search/core";

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
