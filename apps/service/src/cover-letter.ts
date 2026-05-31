import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { NormalizedVacancy, Resume } from "@job-search/contracts";
import {
  fillTemplate,
  loadPrompt,
  promptSourcePath,
  readJsonFileOr,
  readTextFileOr,
  runAiJson,
  type Env,
  type Logger,
  type Paths,
} from "@job-search/core";
import { logGeneration, type DB } from "@job-search/db";

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

export function buildContactFooter(resume: Resume | null): string {
  const phone = resume?.basics.phone?.trim();
  const tgProfile = resume?.basics.profiles.find((p) =>
    /telegram/i.test(p.network),
  );
  let tgUrl = tgProfile?.url?.trim() ?? "";
  const username = (tgProfile as { username?: string } | undefined)?.username
    ?.trim();
  if (!tgUrl && username) {
    tgUrl = username.startsWith("http")
      ? username
      : `https://t.me/${username.replace(/^@/, "")}`;
  }
  const lines: string[] = [];
  if (phone) lines.push(phone);
  if (tgUrl) lines.push(`Telegram: ${tgUrl}`);
  return lines.join("\n");
}

function readResume(paths: Paths): Resume | null {
  return readJsonFileOr<Resume | null>(
    path.join(paths.resumeDir, "master-resume.json"),
    null,
  );
}

function readContactFooter(paths: Paths): string {
  return buildContactFooter(readResume(paths));
}

function candidateName(paths: Paths): string {
  const name = readResume(paths)?.basics?.name ?? "";
  if (name && !name.toUpperCase().includes("TODO")) return name;
  return "";
}

/** Append name + contacts when missing (AI output or legacy templates). */
export function finalizeCoverLetterText(
  letter: string,
  paths: Paths,
  name: string,
): string {
  const contact = readContactFooter(paths);
  const text = letter.trim();
  if (!contact) {
    return name && !text.endsWith(name) ? `${text}\n\n${name}` : text;
  }

  const phone = readResume(paths)?.basics.phone?.trim();
  const tgLine = contact
    .split("\n")
    .find((line) => line.startsWith("Telegram:"));
  const tgUrl = tgLine?.replace(/^Telegram:\s*/, "");
  if (
    (phone && text.includes(phone)) ||
    (tgUrl && text.includes(tgUrl))
  ) {
    return text;
  }

  if (name && text.endsWith(name)) return `${text}\n${contact}`;
  if (name) return `${text}\n\n${name}\n${contact}`;
  return `${text}\n\n${contact}`;
}

export async function generateCoverLetter(
  deps: { env: Env; paths: Paths; db?: DB; logger?: Logger },
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
    const text = finalizeCoverLetterText(
      fillTemplate(
        templateText ||
          "Здравствуйте!\n\nЗаинтересовала вакансия {{role}}{{company_suffix}}.\n\n{{facts}}\n\nБуду рад обсудить ваши задачи.\n\n{{candidate_name}}\n{{contact_footer}}",
        {
          role: vacancy.title,
          company_suffix: companySuffix,
          facts: factLines,
          candidate_name: name,
          contact_footer: readContactFooter(paths),
        },
      ),
      paths,
      name,
    );
    return {
      text,
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
    const { data, rawText, modelId, durationMs } = await runAiJson({
      modelId: env.DRAFT_MODEL,
      prompt,
      schema: coverLetterSchema,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
    });
    deps.db &&
      logGeneration(deps.db, {
        type: "cover_letter",
        inputHash: createHash("sha256")
          .update(vacancy.externalId)
          .digest("hex")
          .slice(0, 16),
        promptVersion: promptSourcePath("cover-letter", paths),
        outputText: rawText,
        model: `${modelId} (${durationMs}ms)`,
      });
    return {
      text: finalizeCoverLetterText(data.letter, paths, name),
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
