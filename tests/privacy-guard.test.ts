import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { scanText, type PrivacyFinding } from "../scripts/lib/privacy-scanner.mjs";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "privacy");

test("privacy scanner accepts safe fixture content", async () => {
  const content = await fs.readFile(path.join(fixturesDir, "safe.txt"), "utf8");
  assert.deepEqual(scanText(content), []);
});

test("privacy scanner rejects secret-like fixture content", async () => {
  const content = await fs.readFile(path.join(fixturesDir, "secret.txt"), "utf8");
  const findings = scanText(content);

  assert.ok(findings.length >= 4);
  assert.ok(findings.some((finding: PrivacyFinding) => finding.pattern === "email"));
  assert.ok(findings.some((finding: PrivacyFinding) => finding.pattern === "phone"));
  assert.ok(findings.some((finding: PrivacyFinding) => finding.pattern === "absolute-path"));
  assert.ok(findings.some((finding: PrivacyFinding) => finding.pattern === "secret-assignment"));
});
