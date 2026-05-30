import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Resume } from "@job-search/contracts";
import { ensureDir, type ResumeTheme } from "@job-search/core";
import { resumeToTypst } from "./typst-template.ts";

export interface RenderResumeInput {
  resume: Resume;
  theme: ResumeTheme;
  outPdfPath: string;
  typstBin?: string;
  /** If set, also write the generated .typ source for debugging. */
  keepSource?: boolean;
}

export interface RenderResumeResult {
  ok: boolean;
  pdfPath: string;
  typPath: string;
  message: string;
}

export function renderResume(input: RenderResumeInput): RenderResumeResult {
  const typstBin = input.typstBin ?? "typst";
  const outDir = path.dirname(input.outPdfPath);
  ensureDir(outDir);

  const typPath = input.outPdfPath.replace(/\.pdf$/i, "") + ".typ";
  const source = resumeToTypst(input.resume, input.theme);
  writeFileSync(typPath, source, "utf8");

  const result = spawnSync(typstBin, ["compile", typPath, input.outPdfPath], {
    encoding: "utf8",
  });

  if (result.error) {
    return {
      ok: false,
      pdfPath: input.outPdfPath,
      typPath,
      message: `Failed to run "${typstBin}": ${result.error.message}. Is Typst installed and on PATH?`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      pdfPath: input.outPdfPath,
      typPath,
      message: `typst compile failed (code ${result.status}): ${result.stderr || result.stdout}`,
    };
  }

  return {
    ok: true,
    pdfPath: input.outPdfPath,
    typPath,
    message: "Resume PDF rendered.",
  };
}

export function isTypstAvailable(typstBin = "typst"): boolean {
  const result = spawnSync(typstBin, ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}
