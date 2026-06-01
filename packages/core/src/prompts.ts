import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolvePaths, type Paths } from "./paths.ts";

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
  return fillTemplate(template, vars);
}

export function promptSourcePath(
  name: string,
  paths: Paths = resolvePaths(),
): string {
  return resolvePromptFile(name, paths);
}
