import fs from "node:fs/promises";
import path from "node:path";

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function parseJsonishFile(filePath) {
  const raw = await readText(filePath);

  try {
    return JSON.parse(raw);
  } catch (error) {
    const relative = path.relative(process.cwd(), filePath) || filePath;
    throw new Error(`Failed to parse ${relative} as JSON-compatible YAML: ${error.message}`);
  }
}

export async function parseJsonLinesFile(filePath) {
  const raw = await readText(filePath);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Failed to parse JSONL line ${index + 1} in ${filePath}: ${error.message}`);
      }
    });
}
