import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function copyFileIfMissing(sourcePath: string, targetPath: string): Promise<boolean> {
  if (await pathExists(targetPath)) {
    return false;
  }

  await ensureDirectory(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
  return true;
}

export async function walkFiles(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(entryPath);
    }

    if (entry.isFile()) {
      return [entryPath];
    }

    return [];
  }));

  return nested.flat().sort((left, right) => left.localeCompare(right));
}
