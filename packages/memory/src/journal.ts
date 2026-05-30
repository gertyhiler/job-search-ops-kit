import path from "node:path";
import { appendJsonl, resolvePaths } from "@job-search/core";
import { logEvent, type DB } from "@job-search/db";

export interface RecordEventInput {
  type: string;
  entityType?: string | null;
  entityId?: number | null;
  payload?: unknown;
  note?: string;
}

function journalFileForToday(): string {
  const { journalDir } = resolvePaths();
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const day = now.toISOString().slice(0, 10);
  return path.join(journalDir, year, `${day}.jsonl`);
}

/**
 * The ONLY sanctioned way to write memory: append an event to the DB (system of
 * record) and mirror it to the append-only journal. The chat agent must call
 * this via CLI/MCP and never edit journal files directly.
 */
export function recordEvent(db: DB, input: RecordEventInput): number {
  const id = logEvent(db, {
    type: input.type,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    payload: input.payload,
  });
  appendJsonl(journalFileForToday(), {
    ts: new Date().toISOString(),
    eventId: id,
    type: input.type,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    note: input.note ?? null,
    payload: input.payload ?? null,
  });
  return id;
}
