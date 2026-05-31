import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Resume } from "@job-search/contracts";
import { resolvePaths } from "@job-search/core";
import {
  buildContactFooter,
  finalizeCoverLetterText,
} from "@job-search/service";

const fixtureResume: Resume = {
  basics: {
    name: "Test User",
    label: "",
    email: "",
    phone: "9000000000",
    location: { city: "", countryCode: "" },
    summary: "",
    profiles: [
      {
        network: "Telegram",
        url: "https://t.me/testuser",
      },
    ],
  },
  work: [],
  skills: [],
  education: [],
  languages: [],
  projects: [],
};

function pathsWithResume(resume: Resume) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "jsok-cover-"));
  const dataDir = path.join(tmp, "data");
  const resumeDir = path.join(dataDir, "resume");
  mkdirSync(resumeDir, { recursive: true });
  writeFileSync(
    path.join(resumeDir, "master-resume.json"),
    JSON.stringify(resume),
    "utf8",
  );
  return { paths: resolvePaths({ dataDir }), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

describe("buildContactFooter", () => {
  it("builds phone and telegram lines from resume", () => {
    expect(buildContactFooter(fixtureResume)).toBe(
      "9000000000\nTelegram: https://t.me/testuser",
    );
  });
});

describe("finalizeCoverLetterText", () => {
  it("appends contacts after AI body ending with name", () => {
    const { paths, cleanup } = pathsWithResume(fixtureResume);
    try {
      const letter = finalizeCoverLetterText(
        "Здравствуйте!\n\nТекст.\n\nTest User",
        paths,
        "Test User",
      );
      expect(letter).toContain("9000000000");
      expect(letter).toContain("Telegram: https://t.me/testuser");
    } finally {
      cleanup();
    }
  });
});
