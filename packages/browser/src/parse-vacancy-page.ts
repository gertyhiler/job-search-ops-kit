export interface ParsedVacancyPage {
  description?: string;
  keySkills?: string[];
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ");
}

function unescapeJsonString(raw: string): string {
  return decodeHtmlEntities(
    raw.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\"),
  );
}

function extractQuotedField(
  html: string,
  startIdx: number,
): string | undefined {
  let i = startIdx;
  let out = "";
  while (i < html.length) {
    const c = html[i];
    if (c === "\\") {
      out += html.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i += 1;
  }
  return out.length > 0 ? unescapeJsonString(out) : undefined;
}

function extractMainDescription(html: string): string | undefined {
  for (const marker of ['"description":"&lt;', '"description":"<']) {
    const idx = html.indexOf(marker);
    if (idx < 0) continue;
    const value = extractQuotedField(html, idx + '"description":"'.length);
    if (value && value.length > 100) return value;
  }
  return undefined;
}

function extractKeySkills(html: string): string[] {
  const match = html.match(/"keySkills":\{"keySkill":(\[[^\]]*\])\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/** Parse embedded vacancy JSON from an HH vacancy page HTML response. */
export function parseVacancyPageHtml(html: string): ParsedVacancyPage {
  const description = extractMainDescription(html);
  const keySkills = extractKeySkills(html);
  return {
    ...(description ? { description } : {}),
    ...(keySkills.length > 0 ? { keySkills } : {}),
  };
}
