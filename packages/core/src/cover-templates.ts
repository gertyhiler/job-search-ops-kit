import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { NormalizedVacancy } from "@job-search/contracts";

const selectKeywordSchema = z.object({
  term: z.string().min(1),
  weight: z.number().default(1),
});

const selectRegexSchema = z.object({
  pattern: z.string().min(1),
  weight: z.number().default(1),
  flags: z.string().default("i"),
});

const selectUseCasesSchema = z.object({
  ids: z.array(z.string()).default([]),
  weight: z.number().default(2),
});

const selectFieldsSchema = z.object({
  title: z.number().default(1),
  keySkills: z.number().default(1),
  description: z.number().default(1),
});

const selectSchema = z.object({
  keywords: z.array(selectKeywordSchema).default([]),
  regex: z.array(selectRegexSchema).default([]),
  useCases: selectUseCasesSchema.optional(),
  fields: selectFieldsSchema.default({
    title: 1,
    keySkills: 1,
    description: 1,
  }),
});

export const coverTemplateMetaSchema = z.object({
  id: z.string().min(1),
  priority: z.number().default(0),
  fallback: z.boolean().default(false),
  select: selectSchema.default({}),
});

export type CoverTemplateMeta = z.infer<typeof coverTemplateMetaSchema>;

export interface ParsedCoverTemplate {
  meta: CoverTemplateMeta;
  body: string;
  file: string;
}

export interface LoadedCoverTemplate extends ParsedCoverTemplate {
  filePath: string;
}

export interface PickedCoverTemplate extends LoadedCoverTemplate {
  score: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Split YAML frontmatter and letter body from a cover template file. */
export function parseCoverTemplateFile(
  content: string,
  file: string,
): ParsedCoverTemplate {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`Cover template ${file} missing YAML frontmatter (---)`);
  }
  const raw = parseYaml(match[1]);
  const meta = coverTemplateMetaSchema.parse(raw ?? {});
  return { meta, body: match[2].trim(), file };
}

let templateCache: {
  dir: string;
  mtime: number;
  templates: LoadedCoverTemplate[];
} | null = null;

function dirMaxMtime(templatesDir: string, files: string[]): number {
  let max = statSync(templatesDir).mtimeMs;
  for (const file of files) {
    max = Math.max(max, statSync(path.join(templatesDir, file)).mtimeMs);
  }
  return max;
}

/** Load all `cover-*.md` templates from a directory (cached by mtime). */
export function loadCoverTemplates(
  templatesDir: string,
): LoadedCoverTemplate[] {
  const files = readdirSync(templatesDir)
    .filter((f) => f.startsWith("cover-") && f.endsWith(".md"))
    .sort();
  const mtime = dirMaxMtime(templatesDir, files);
  if (
    templateCache &&
    templateCache.dir === templatesDir &&
    templateCache.mtime === mtime
  ) {
    return templateCache.templates;
  }

  const templates = files.map((file) => {
    const filePath = path.join(templatesDir, file);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseCoverTemplateFile(content, file);
    return { ...parsed, filePath: file };
  });

  templateCache = { dir: templatesDir, mtime, templates };
  return templates;
}

/** Clear in-process template cache (for tests). */
export function clearCoverTemplateCache(): void {
  templateCache = null;
}

function vacancyFieldTexts(v: NormalizedVacancy): {
  title: string;
  keySkills: string;
  description: string;
} {
  return {
    title: v.title.toLowerCase(),
    keySkills: v.keySkills.join(" ").toLowerCase(),
    description: v.description.toLowerCase(),
  };
}

/** Score how well a template matches a vacancy (higher = better fit). */
export function scoreCoverTemplate(
  meta: CoverTemplateMeta,
  vacancy: NormalizedVacancy,
  pickedUseCaseIds: string[] = [],
): number {
  const fields = meta.select.fields;
  const parts = vacancyFieldTexts(vacancy);
  let score = 0;

  for (const kw of meta.select.keywords) {
    const term = kw.term.toLowerCase();
    if (parts.title.includes(term)) score += kw.weight * fields.title;
    if (parts.keySkills.includes(term)) score += kw.weight * fields.keySkills;
    if (parts.description.includes(term)) {
      score += kw.weight * fields.description;
    }
  }

  for (const re of meta.select.regex) {
    let regex: RegExp;
    try {
      regex = new RegExp(re.pattern, re.flags);
    } catch {
      continue;
    }
    if (regex.test(parts.title)) score += re.weight * fields.title;
    if (regex.test(parts.keySkills)) score += re.weight * fields.keySkills;
    if (regex.test(parts.description)) score += re.weight * fields.description;
  }

  const uc = meta.select.useCases;
  if (uc && uc.ids.length > 0) {
    const overlap = pickedUseCaseIds.filter((id) => uc.ids.includes(id)).length;
    score += overlap * uc.weight;
  }

  return score;
}

/** Pick the best-matching cover template for a vacancy. */
export function pickCoverTemplate(
  vacancy: NormalizedVacancy,
  templates: LoadedCoverTemplate[],
  pickedUseCaseIds: string[] = [],
): PickedCoverTemplate {
  if (templates.length === 0) {
    throw new Error("No cover templates found in templates directory");
  }

  const candidates = templates.filter((t) => !t.meta.fallback);
  const scored = candidates
    .map((t) => ({
      template: t,
      score: scoreCoverTemplate(t.meta, vacancy, pickedUseCaseIds),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.template.meta.priority - a.template.meta.priority;
    });

  const best = scored[0];
  if (best && best.score > 0) {
    return { ...best.template, score: best.score };
  }

  const fallback =
    templates.find((t) => t.meta.fallback) ??
    templates.find((t) => t.meta.id === "generic") ??
    templates[0];
  return { ...fallback, score: 0 };
}
