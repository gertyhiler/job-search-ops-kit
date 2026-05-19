import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureCanonicalDataTree, ensureCanonicalStateTree } from "../core/bootstrap.ts";
import { ensureDirectory } from "../core/fs.ts";
import { parseJsonishFile } from "../core/json.ts";
import { getAppRoot, getDataRoot, getRepoRoot, getStateRoot, resolveStatePath } from "../core/paths.ts";
import { normalizeScheduleSeed, type RuntimeSchedule, type ScheduleSeed } from "../core/schedules.ts";
import { PROJECTION_TABLES } from "./schema.ts";

export interface MigrateDatabaseOptions {
  dbPath?: string;
  dataRoot?: string;
  stateRoot?: string;
  now?: Date;
}

const SCHEDULE_COLUMNS = [
  "id",
  "cron",
  "role",
  "model",
  "reasoning_effort",
  "prompt_file",
  "mcp_profile",
  "dry_run",
  "enabled",
  "next_run_at",
  "last_run_at",
  "last_status",
  "catchup_policy",
  "max_staleness_sec",
  "fails_in_a_row"
] as const;

function migrationDirectory(): string {
  const root = process.env.JOB_SEARCH_APP_ROOT?.trim() ? getAppRoot() : getRepoRoot();
  return path.join(root, "packages", "db", "migrations");
}

export function defaultDatabasePath(): string {
  return resolveStatePath("stateRoot", "job-search.db");
}

export async function openDatabase(dbPath = defaultDatabasePath()): Promise<DatabaseSync> {
  await ensureDirectory(path.dirname(dbPath));
  return new DatabaseSync(dbPath);
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await fs.readdir(migrationDirectory(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function boolToSql(value: boolean | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return value ? 1 : 0;
}

export async function loadScheduleSeeds(): Promise<ScheduleSeed[]> {
  const root = process.env.JOB_SEARCH_APP_ROOT?.trim() ? getAppRoot() : getRepoRoot();
  const seedPath = path.join(root, "config", "defaults", "schedules.seed.yaml");
  return parseJsonishFile(seedPath);
}

function insertScheduleRow(db: DatabaseSync, row: RuntimeSchedule): void {
  db.prepare(`
    INSERT INTO schedule (
      id, cron, role, model, reasoning_effort, prompt_file, mcp_profile, dry_run, enabled,
      next_run_at, last_run_at, last_status, catchup_policy, max_staleness_sec, fails_in_a_row
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.cron,
    row.role,
    row.model ?? null,
    row.reasoning_effort ?? null,
    row.prompt_file,
    row.mcp_profile ?? null,
    boolToSql(row.dry_run),
    boolToSql(row.enabled),
    row.next_run_at,
    row.last_run_at,
    row.last_status,
    row.catchup_policy,
    row.max_staleness_sec ?? null,
    row.fails_in_a_row
  );
}

export async function seedSchedules(
  db: DatabaseSync,
  now = new Date()
): Promise<{ created: string[]; preserved: string[] }> {
  const seeds = await loadScheduleSeeds();
  const existingIds = new Set<string>(
    db.prepare("SELECT id FROM schedule").all().map((row: any) => String(row.id))
  );

  const created: string[] = [];
  const preserved: string[] = [];

  for (const seed of seeds) {
    if (existingIds.has(seed.id)) {
      preserved.push(seed.id);
      continue;
    }

    insertScheduleRow(db, normalizeScheduleSeed(seed, now));
    created.push(seed.id);
  }

  return { created, preserved };
}

export async function migrateDatabase(options: MigrateDatabaseOptions = {}): Promise<{
  dbPath: string;
  appliedMigrations: string[];
  seededSchedules: string[];
  preservedSchedules: string[];
}> {
  const dataRoot = options.dataRoot ?? getDataRoot();
  const stateRoot = options.stateRoot ?? getStateRoot();
  const dbPath = options.dbPath ?? path.join(stateRoot, "job-search.db");
  await ensureCanonicalDataTree(dataRoot);
  await ensureCanonicalStateTree(stateRoot);

  const db = await openDatabase(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS __migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const migrationFiles = await listMigrationFiles();
    const appliedMigrations: string[] = [];

    for (const fileName of migrationFiles) {
      const alreadyApplied = db.prepare("SELECT 1 FROM __migrations WHERE id = ? LIMIT 1").get(fileName);
      if (alreadyApplied) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationDirectory(), fileName), "utf8");
      db.exec(sql);
      db.prepare("INSERT INTO __migrations (id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
      appliedMigrations.push(fileName);
    }

    const seeded = await seedSchedules(db, options.now);
    return {
      dbPath,
      appliedMigrations,
      seededSchedules: seeded.created,
      preservedSchedules: seeded.preserved
    };
  } finally {
    db.close();
  }
}

export async function resetProjectionTables(db: DatabaseSync): Promise<void> {
  db.exec("BEGIN");
  try {
    for (const tableName of PROJECTION_TABLES) {
      db.exec(`DELETE FROM ${tableName}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function dumpTables(dbPath = defaultDatabasePath()): Promise<Record<string, any[]>> {
  const db = await openDatabase(dbPath);
  try {
    const tableNames = [...PROJECTION_TABLES, "schedule"];
    return Object.fromEntries(tableNames.map((tableName) => {
      const orderBy = tableName === "application_event" ? "ts, id" : "id";
      return [tableName, db.prepare(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all()];
    }));
  } finally {
    db.close();
  }
}

export function parseJsonColumn<T>(value: string | null): T {
  if (value == null) {
    return null as T;
  }
  return JSON.parse(value) as T;
}

export function toJsonColumn(value: unknown): string {
  return serializeJson(value);
}

export { SCHEDULE_COLUMNS };
