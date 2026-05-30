import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { ensureDir } from "@job-search/core";

// `node:sqlite` is a newer Node builtin that some bundlers (Vite/Vitest) cannot
// statically resolve. Load it at runtime via require so only Node ever resolves it;
// the type-only import above keeps full typing.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncImpl } = nodeRequire(
  "node:sqlite",
) as typeof import("node:sqlite");

export type DB = DatabaseSync;

export function openDb(dbPath: string): DB {
  ensureDir(path.dirname(dbPath));
  const db = new DatabaseSyncImpl(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

/** Apply the schema (idempotent). Returns the db. */
export function migrate(db: DB): DB {
  const schemaPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "schema.sql",
  );
  const ddl = readFileSync(schemaPath, "utf8");
  db.exec(ddl);
  return db;
}

export function openAndMigrate(dbPath: string): DB {
  return migrate(openDb(dbPath));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * node:sqlite returns rows as `Record<string, SQLOutputValue>`, which does not
 * structurally overlap our row interfaces (it includes bigint/Uint8Array). This
 * loosely-typed wrapper lets repositories cast results to their row types and
 * bind named-parameter objects without per-call casts.
 */
export interface LooseStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

export function prep(db: DB, sql: string): LooseStatement {
  return db.prepare(sql) as unknown as LooseStatement;
}
