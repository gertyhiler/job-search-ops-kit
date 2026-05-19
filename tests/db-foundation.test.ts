import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { dumpTables, migrateDatabase, parseJsonColumn } from "../packages/db/database.ts";
import { replayDatabase } from "../packages/db/replay.ts";

async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const sourceEntry = path.join(sourcePath, entry.name);
    const targetEntry = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourceEntry, targetEntry);
      return;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourceEntry, targetEntry);
    }
  }));
}

async function withExampleUserData(fn: (userDataRoot: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-db-"));
  const exampleRoot = path.join(process.cwd(), "examples", "user-data-example");
  try {
    await copyDirectory(exampleRoot, tempDir);
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("migrateDatabase creates the schema under state root and seeds schedules without overwriting runtime state", async () => {
  await withExampleUserData(async (dataRoot) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-state-"));
    const dbPath = path.join(stateRoot, "job-search.db");
    const initial = await migrateDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });

    assert.ok(initial.appliedMigrations.includes("0001_foundation.sql"));
    assert.ok(initial.seededSchedules.length > 0);

    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE schedule SET next_run_at = ?, last_status = ?, fails_in_a_row = ? WHERE id = ?").run(
      "2030-01-01T00:00:00.000Z",
      "manual-test",
      7,
      "daily-scout"
    );
    db.close();

    const second = await migrateDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-24T06:00:00Z")
    });

    assert.equal(second.seededSchedules.length, 0);
    assert.ok(second.preservedSchedules.includes("daily-scout"));

    const verifyDb = new DatabaseSync(dbPath);
    const row: any = verifyDb.prepare("SELECT next_run_at, last_status, fails_in_a_row FROM schedule WHERE id = ?").get("daily-scout");
    verifyDb.close();

    assert.equal(row.next_run_at, "2030-01-01T00:00:00.000Z");
    assert.equal(row.last_status, "manual-test");
    assert.equal(row.fails_in_a_row, 7);

    await fs.rm(stateRoot, { recursive: true, force: true });
  });
});

test("replayDatabase hydrates the SQLite projection from the synthetic fixture deterministically", async () => {
  await withExampleUserData(async (dataRoot) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-state-"));
    const dbPath = path.join(stateRoot, "job-search.db");
    const first = await replayDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });
    const firstSnapshot = await dumpTables(dbPath);

    const second = await replayDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });
    const secondSnapshot = await dumpTables(dbPath);

    assert.deepEqual(secondSnapshot, firstSnapshot);
    assert.equal(first.rowCounts.application, 1);
    assert.equal(first.rowCounts.application_event, 2);
    assert.equal(second.rowCounts.strategy_change, 1);

    const applicationRow = firstSnapshot.application[0];
    const vacancyRow = firstSnapshot.vacancy[0];
    const strategyRow = firstSnapshot.strategy_change[0];

    assert.equal(applicationRow.status, "screened");
    assert.equal(vacancyRow.status, "applied");
    assert.equal(strategyRow.decision, "auto_accept");
    assert.deepEqual(parseJsonColumn<string[]>(vacancyRow.tags_json), ["platform", "observability", "kubernetes"]);

    await fs.rm(stateRoot, { recursive: true, force: true });
  });
});

test("recovery path rebuilds the same state after deleting the database file", async () => {
  await withExampleUserData(async (dataRoot) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-state-"));
    const dbPath = path.join(stateRoot, "job-search.db");
    await replayDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });
    const beforeDelete = await dumpTables(dbPath);

    await fs.rm(dbPath, { force: true });

    await migrateDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });
    await replayDatabase({
      dataRoot,
      stateRoot,
      dbPath,
      now: new Date("2026-04-23T06:00:00Z")
    });
    const afterRestore = await dumpTables(dbPath);

    assert.deepEqual(afterRestore, beforeDelete);

    await fs.rm(stateRoot, { recursive: true, force: true });
  });
});
