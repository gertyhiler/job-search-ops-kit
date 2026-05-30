import { countEventsSince, prep, type DB } from "@job-search/db";

export function lastReflectionEnd(db: DB): string | null {
  const row = prep(
    db,
    `SELECT period_end FROM reflection_reports ORDER BY id DESC LIMIT 1`,
  ).get() as { period_end: string | null } | undefined;
  return row?.period_end ?? null;
}

function defaultWindowStart(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function consolidationWindowStart(db: DB): string {
  return lastReflectionEnd(db) ?? defaultWindowStart();
}

export function eventsSinceLastReflection(db: DB): number {
  return countEventsSince(db, consolidationWindowStart(db));
}

/** Trigger-based cadence: enough new events accumulated since last consolidation. */
export function shouldConsolidate(db: DB, threshold: number): boolean {
  return eventsSinceLastReflection(db) >= threshold;
}
