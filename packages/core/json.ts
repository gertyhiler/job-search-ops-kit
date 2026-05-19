import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirectory } from "./fs.ts";

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export function parseJsonish(raw: string, label = "value"): any {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${label} as JSON-compatible YAML: ${message}`);
  }
}

export async function parseJsonishFile(filePath: string): Promise<any> {
  return parseJsonish(await readText(filePath), path.relative(process.cwd(), filePath) || filePath);
}

export async function parseJsonLinesFile(filePath: string): Promise<any[]> {
  const raw = await readText(filePath);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseJsonish(line, `${filePath} line ${index + 1}`));
}

export function stringifyJsonish(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonishFile(filePath: string, value: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, stringifyJsonish(value), "utf8");
}

export async function appendJsonLineFile(filePath: string, value: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
