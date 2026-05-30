import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readJsonFile<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function readJsonFileOr<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function writeTextFile(file: string, text: string): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, text, "utf8");
}

export function readTextFileOr(file: string, fallback: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : fallback;
}

export function appendJsonl(file: string, record: unknown): void {
  ensureDir(path.dirname(file));
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function copyIfMissing(src: string, dest: string): boolean {
  if (existsSync(dest)) return false;
  ensureDir(path.dirname(dest));
  copyFileSync(src, dest);
  return true;
}

export { existsSync };
