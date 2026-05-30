import path from "node:path";
import { z } from "zod";
import type { NormalizedVacancy, Resume } from "@job-search/contracts";
import {
  fillTemplate,
  loadPrompt,
  readJsonFileOr,
  readTextFileOr,
  runAiJson,
  type Env,
  type Logger,
  type Paths,
} from "@job-search/core";

const coverLetterSchema = z.object({
  letter: z.string().min(1),
  usedFacts: z.array(z.string()).default([]),
});

export interface CoverLetterResult {
  text: string;
  templateId: string;
  usedFacts: string[];
  usedAi: boolean;
}

function chooseTemplate(v: NormalizedVacancy): { id: string; file: string } {
  const text =
    `${v.title} ${v.description} ${v.keySkills.join(" ")}`.toLowerCase();
  if (/(admin|админ|платформ|platform|backoffice|bitrix)/.test(text)) {
    return { id: "platform-admin", file: "cover-platform-admin.md" };
  }
  if (/(ai|automation|автоматиз|llm|ml)/.test(text)) {
    return { id: "ai-automation", file: "cover-ai-automation.md" };
  }
  if (/(fullstack|фулстек|full-stack|node|backend)/.test(text)) {
    return { id: "fullstack-product", file: "cover-fullstack-product.md" };
  }
  if (/(product|продукт|react)/.test(text)) {
    return { id: "react-product", file: "cover-react-product.md" };
  }
  return { id: "generic", file: "cover-generic.md" };
}

function readFacts(paths: Paths): { full: string; bullets: string[] } {
  const facts = readTextFileOr(
    path.join(paths.profileDir, "experience-facts.md"),
    "",
  );
  const evidence = readTextFileOr(
    path.join(paths.profileDir, "evidence.md"),
    "",
  );
  const full = [facts, evidence].filter(Boolean).join("\n\n").trim();
  const bullets = facts
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-") && !l.toUpperCase().includes("TODO"))
    .map((l) => l.replace(/^-\s*(FACT:)?\s*/i, "").trim())
    .filter(Boolean);
  return { full, bullets };
}

function candidateName(paths: Paths): string {
  const resume = readJsonFileOr<Resume | null>(
    path.join(paths.resumeDir, "master-resume.json"),
    null,
  );
  const name = resume?.basics?.name ?? "";
  if (name && !name.toUpperCase().includes("TODO")) return name;
  return "";
}

export async function generateCoverLetter(
  deps: { env: Env; paths: Paths; logger?: Logger },
  vacancy: NormalizedVacancy,
): Promise<CoverLetterResult> {
  const { env, paths } = deps;
  const tpl = chooseTemplate(vacancy);
  const templateText = readTextFileOr(
    path.join(paths.templatesDir, tpl.file),
    "",
  );
  const { full, bullets } = readFacts(paths);
  const name = candidateName(paths);
  const companySuffix = vacancy.companyName
    ? ` в компанию «${vacancy.companyName}»`
    : "";

  // Deterministic fallback (also used when no AI CLI is available or it fails).
  const fallback = (): CoverLetterResult => {
    const factLines = bullets
      .slice(0, 3)
      .map((b) => `- ${b}`)
      .join("\n");
    const text = fillTemplate(
      templateText ||
        "Здравствуйте!\n\nЗаинтересовала вакансия {{role}}{{company_suffix}}.\n\n{{facts}}\n\n{{candidate_name}}",
      {
        role: vacancy.title,
        company_suffix: companySuffix,
        facts: factLines,
        candidate_name: name,
      },
    );
    return {
      text: text.trim(),
      templateId: tpl.id,
      usedFacts: bullets.slice(0, 3),
      usedAi: false,
    };
  };

  if (full.length === 0) {
    // No facts yet (pre-init): still produce a template-based letter.
    return fallback();
  }

  try {
    const prompt = loadPrompt("cover-letter", {
      role: vacancy.title,
      company: vacancy.companyName || "",
      candidate_name: name,
      template: templateText,
      facts: full,
    });
    const { data } = await runAiJson({
      modelId: env.DRAFT_MODEL,
      prompt,
      schema: coverLetterSchema,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
    });
    return {
      text: data.letter.trim(),
      templateId: tpl.id,
      usedFacts: data.usedFacts,
      usedAi: true,
    };
  } catch (error) {
    deps.logger?.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        vacancy: vacancy.externalId,
      },
      "Cover-letter AI failed; using template fallback",
    );
    return fallback();
  }
}
