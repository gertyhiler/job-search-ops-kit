import { readFileSync } from "node:fs";
import path from "node:path";
import { resolvePaths } from "./paths.ts";

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

/** Load a prompt template from prompts/<name>.prompt.md and substitute vars. */
export function loadPrompt(
  name: string,
  vars: Record<string, string> = {},
): string {
  const { promptsDir } = resolvePaths();
  const file = path.join(promptsDir, `${name}.prompt.md`);
  const template = readFileSync(file, "utf8");
  return fillTemplate(template, vars);
}
