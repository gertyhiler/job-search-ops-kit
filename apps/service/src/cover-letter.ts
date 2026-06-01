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

interface UseCase {
  id: string;
  title: string;
  signals: string[];
  bullets: string[];
}

function readUserProfile(paths: Paths): string {
  return readTextFileOr(path.join(paths.profileDir, "user-profile.md"), "").trim();
}

function parseUseCases(markdown: string): UseCase[] {
  const cases: UseCase[] = [];
  const parts = markdown.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const header = part.slice(0, newline).trim();
    const body = part.slice(newline + 1);

    const [idRaw, ...titleParts] = header.split(":");
    const id = (idRaw || "").trim();
    if (!id.toUpperCase().startsWith("UC-")) continue;
    const title = titleParts.join(":").trim() || header.replace(/^UC-[^:]+:\s*/, "");

    const lines = body.split("\n").map((l) => l.trim());
    const signals: string[] = [];
    const bullets: string[] = [];

    let inSignals = false;
    let inBullets = false;
    for (const line of lines) {
      if (/^when relevant/i.test(line)) {
        inSignals = true;
        inBullets = false;
        continue;
      }
      if (/^bullets:/i.test(line)) {
        inBullets = true;
        inSignals = false;
        continue;
      }
      if (/^###\s+/i.test(line) || /^##\s+/i.test(line)) {
        inSignals = false;
        inBullets = false;
      }
      if (!line.startsWith("-")) continue;
      const value = line.replace(/^-+\s*/, "").trim();
      if (!value || value.toUpperCase().includes("TODO")) continue;
      if (inSignals) signals.push(value);
      else if (inBullets) bullets.push(value);
    }

    if (signals.length === 0 && bullets.length === 0) continue;
    cases.push({ id, title, signals, bullets });
  }
  return cases;
}

function readUseCases(paths: Paths): { raw: string; cases: UseCase[] } {
  const raw = readTextFileOr(path.join(paths.profileDir, "use-cases.md"), "").trim();
  return { raw, cases: raw ? parseUseCases(raw) : [] };
}

function pickUseCaseBullets(
  vacancy: NormalizedVacancy,
  useCases: UseCase[],
): { bullets: string[]; used: string[] } {
  const haystack = `${vacancy.title}\n${vacancy.companyName}\n${vacancy.keySkills.join(" ")}\n${vacancy.description}`.toLowerCase();
  const scored = useCases
    .map((uc) => {
      const signals = uc.signals.length ? uc.signals : [uc.title];
      let score = 0;
      for (const s of signals) {
        const needle = s.toLowerCase();
        if (!needle) continue;
        if (haystack.includes(needle)) score += 3;
      }
      // Bonus for bullet keyword overlap (cheap heuristic).
      for (const b of uc.bullets.slice(0, 6)) {
        const words = b
          .toLowerCase()
          .split(/[^a-zа-я0-9+.#-]+/i)
          .filter((w) => w.length >= 4)
          .slice(0, 10);
        for (const w of words) if (haystack.includes(w)) score += 1;
      }
      return { uc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 2).map((x) => x.uc);
  const out: string[] = [];
  const used: string[] = [];
  for (const uc of top) {
    used.push(uc.id);
    for (const b of uc.bullets.slice(0, 3)) out.push(b);
  }
  return { bullets: out.slice(0, 5), used };
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
  const userProfile = readUserProfile(paths);
  const { raw: useCasesRaw, cases: useCases } = readUseCases(paths);
  const name = candidateName(paths);
  const companySuffix = vacancy.companyName
    ? ` в компанию «${vacancy.companyName}»`
    : "";

  // Deterministic fallback (also used when no AI CLI is available or it fails).
  const fallback = (): CoverLetterResult => {
    const picked = pickUseCaseBullets(vacancy, useCases);
    const factLines = picked.bullets.map((b) => `- ${b}`).join("\n");
    const text = finalizeCoverLetterText(
      fillTemplate(
        templateText ||
          "Здравствуйте!\n\nЗаинтересовала вакансия {{role}}{{company_suffix}}.\n\n{{facts}}\n\nБуду рад обсудить ваши задачи.\n\n{{candidate_name}}\n{{contact_footer}}",
        {
          role: vacancy.title,
          company_suffix: companySuffix,
          facts: factLines || "- Готов обсудить, какие use-cases из моего опыта лучше всего совпадают с вашими задачами.",
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
      usedFacts: picked.used,
      usedAi: false,
    };
  };

  if (!useCasesRaw || useCases.length === 0 || !userProfile) {
    // No usable profile/use-cases yet (pre-init): still produce a template-based letter.
    return fallback();
  }

  try {
    const prompt = loadPrompt("cover-letter", {
      role: vacancy.title,
      company: vacancy.companyName || "",
      candidate_name: name,
      template: templateText,
      user_profile: userProfile,
      use_cases: useCasesRaw,
      vacancy_title: vacancy.title,
      vacancy_full_text: `${vacancy.title}\n\n${vacancy.description}`.trim(),
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
