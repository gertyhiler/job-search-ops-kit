import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolvePaths, type Paths } from "./paths.ts";

const PROFILE_PROMPT_ADDITIONS = "prompt-additions.md";

/** Replace {{var}} placeholders. Unknown vars are left as-is. */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (match, key: string) => {
      return key in vars ? vars[key] : match;
    },
  );
}

/** Parse `## section` blocks from data/profile/prompt-additions.md (keys lowercased). */
export function extractProfilePromptSections(
  markdown: string,
): Map<string, string> {
  const sections = new Map<string, string>();
  for (const part of markdown.split(/^##\s+/m).slice(1)) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const key = part.slice(0, newline).trim().toLowerCase();
    const body = part.slice(newline + 1).trim();
    if (key && body) sections.set(key, body);
  }
  return sections;
}

/** Text from profile to append for a named subprocess prompt (`all` + prompt name). */
export function profilePromptAdditionsFor(
  promptName: string,
  paths: Paths = resolvePaths(),
): string {
  const file = path.join(paths.profileDir, PROFILE_PROMPT_ADDITIONS);
  if (!existsSync(file)) return "";
  const sections = extractProfilePromptSections(readFileSync(file, "utf8"));
  const chunks: string[] = [];
  const all = sections.get("all");
  if (all) chunks.push(all);
  const specific = sections.get(promptName.toLowerCase());
  if (specific) chunks.push(specific);
  return chunks.join("\n\n").trim();
}

function resolvePromptFile(name: string, paths: Paths): string {
  const dataPrompt = path.join(paths.dataDir, "prompts", `${name}.md`);
  if (existsSync(dataPrompt)) return dataPrompt;
  return path.join(paths.promptsDir, `${name}.prompt.md`);
}

/** Load a prompt from data/prompts/<name>.md or prompts/<name>.prompt.md. */
export function loadPrompt(
  name: string,
  vars: Record<string, string> = {},
  paths: Paths = resolvePaths(),
): string {
  const file = resolvePromptFile(name, paths);
  const template = readFileSync(file, "utf8");
  let result = fillTemplate(template, vars);
  const additions = profilePromptAdditionsFor(name, paths);
  if (additions) {
    result += `\n\n---\nCANDIDATE-SPECIFIC (from data/profile/${PROFILE_PROMPT_ADDITIONS}):\n${additions}\n`;
  }
  return result;
}

export function promptSourcePath(
  name: string,
  paths: Paths = resolvePaths(),
): string {
  return resolvePromptFile(name, paths);
}
