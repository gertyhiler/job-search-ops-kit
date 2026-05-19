export interface ScheduleSeed {
  id: string;
  cron: string;
  role: string;
  model?: string | null;
  reasoning_effort?: string | null;
  prompt_file: string;
  mcp_profile?: string | null;
  dry_run: boolean;
  enabled: boolean;
  catchup_policy: "run_once_if_overdue" | "skip_if_stale" | "run_all_missed";
  max_staleness_sec?: number | null;
}

export interface RuntimeSchedule extends ScheduleSeed {
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  fails_in_a_row: number;
}

interface CronFieldRange {
  min: number;
  max: number;
}

function parseInteger(value: string, range: CronFieldRange, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`Invalid ${fieldName} value "${value}" in cron expression.`);
  }
  return parsed;
}

function buildAllowedValues(field: string, range: CronFieldRange, fieldName: string): Set<number> {
  const allowed = new Set<number>();
  const segments = field.split(",");

  const addSequence = (start: number, end: number, step: number) => {
    for (let cursor = start; cursor <= end; cursor += step) {
      allowed.add(cursor);
    }
  };

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      throw new Error(`Empty ${fieldName} segment in cron expression.`);
    }

    if (segment === "*") {
      addSequence(range.min, range.max, 1);
      continue;
    }

    const [base, stepPart] = segment.split("/");
    const step = stepPart ? parseInteger(stepPart, { min: 1, max: range.max - range.min + 1 }, `${fieldName} step`) : 1;

    if (base === "*") {
      addSequence(range.min, range.max, step);
      continue;
    }

    if (base.includes("-")) {
      const [startRaw, endRaw] = base.split("-");
      const start = parseInteger(startRaw, range, fieldName);
      const end = parseInteger(endRaw, range, fieldName);
      if (end < start) {
        throw new Error(`Invalid ${fieldName} range "${base}" in cron expression.`);
      }
      addSequence(start, end, step);
      continue;
    }

    const single = parseInteger(base, range, fieldName);
    addSequence(single, single, step);
  }

  return allowed;
}

function parseDayOfWeekField(field: string): Set<number> {
  const allowed = buildAllowedValues(field, { min: 0, max: 7 }, "day-of-week");
  if (allowed.has(7)) {
    allowed.delete(7);
    allowed.add(0);
  }
  return allowed;
}

function matchesCron(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expected a five-field cron expression, got "${cron}".`);
  }

  const [minuteField, hourField, dayField, monthField, weekDayField] = parts;
  const minute = buildAllowedValues(minuteField, { min: 0, max: 59 }, "minute");
  const hour = buildAllowedValues(hourField, { min: 0, max: 23 }, "hour");
  const dayOfMonth = buildAllowedValues(dayField, { min: 1, max: 31 }, "day-of-month");
  const month = buildAllowedValues(monthField, { min: 1, max: 12 }, "month");
  const dayOfWeek = parseDayOfWeekField(weekDayField);

  return minute.has(date.getMinutes())
    && hour.has(date.getHours())
    && dayOfMonth.has(date.getDate())
    && month.has(date.getMonth() + 1)
    && dayOfWeek.has(date.getDay());
}

export function getNextCronOccurrence(cron: string, now = new Date()): Date {
  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let checked = 0; checked < 60 * 24 * 366 * 5; checked += 1) {
    if (matchesCron(cron, cursor)) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  throw new Error(`Could not find the next run time for cron "${cron}" within five years.`);
}

export function normalizeScheduleSeed(seed: ScheduleSeed, now = new Date()): RuntimeSchedule {
  return {
    ...seed,
    next_run_at: getNextCronOccurrence(seed.cron, now).toISOString(),
    last_run_at: null,
    last_status: null,
    fails_in_a_row: 0
  };
}

export function normalizeScheduleSeeds(seeds: ScheduleSeed[], now = new Date()): RuntimeSchedule[] {
  return seeds.map((seed) => normalizeScheduleSeed(seed, now));
}
