import type {
  ApplyMode,
  NormalizedVacancy,
  PipelineStatus,
  QueueType,
} from "@job-search/contracts";
import type { DB } from "./connection.ts";
import { nowIso, prep } from "./connection.ts";

// ----------------------------------------------------------------------------
// Row types (snake_case, mirroring the schema)
// ----------------------------------------------------------------------------

export interface CompanyRow {
  id: number;
  source: string;
  external_id: string | null;
  name: string;
  url: string | null;
  normalized_name: string;
  is_blacklisted: number;
  is_target: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VacancyRow {
  id: number;
  source: string;
  external_id: string;
  url: string;
  company_id: number | null;
  title: string;
  description: string | null;
  key_skills_json: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_gross: number | null;
  location: string | null;
  remote_type: string | null;
  schedule: string | null;
  employment: string | null;
  experience: string | null;
  raw_payload_json: string | null;
  normalized_payload_json: string | null;
  content_hash: string;
  fit_score: number | null;
  salary_score: number | null;
  risk_score: number | null;
  priority_score: number | null;
  apply_mode: string | null;
  score_reasons_json: string | null;
  score_risks_json: string | null;
  pipeline_status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export interface ApplicationRow {
  id: number;
  vacancy_id: number;
  company_id: number | null;
  status: string;
  apply_mode: string | null;
  resume_version: string | null;
  cover_letter_version: string | null;
  cover_letter_text: string | null;
  applied_at: string | null;
  failure_reason: string | null;
  next_action_at: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueRow {
  id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  status: string;
  priority: number;
  reason: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface EventRow {
  id: number;
  type: string;
  entity_type: string | null;
  entity_id: number | null;
  payload_json: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Companies
// ----------------------------------------------------------------------------

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, " ")
    .trim();
}

export function upsertCompany(
  db: DB,
  input: {
    source: string;
    externalId?: string | null;
    name: string;
    url?: string | null;
  },
): CompanyRow {
  const ts = nowIso();
  const normalized = normalizeCompanyName(input.name || "unknown");
  prep(
    db,
    `INSERT INTO companies (source, external_id, name, url, normalized_name, created_at, updated_at)
     VALUES (@source, @externalId, @name, @url, @normalized, @ts, @ts)
     ON CONFLICT (source, normalized_name) DO UPDATE SET
       external_id = COALESCE(excluded.external_id, companies.external_id),
       url = COALESCE(excluded.url, companies.url),
       updated_at = @ts`,
  ).run({
    source: input.source,
    externalId: input.externalId ?? null,
    name: input.name || "unknown",
    url: input.url ?? null,
    normalized,
    ts,
  });
  return prep(
    db,
    `SELECT * FROM companies WHERE source = ? AND normalized_name = ?`,
  ).get(input.source, normalized) as CompanyRow;
}

export function getCompanyById(db: DB, id: number): CompanyRow | undefined {
  return prep(db, `SELECT * FROM companies WHERE id = ?`).get(id) as
    | CompanyRow
    | undefined;
}

export function setCompanyFlags(
  db: DB,
  id: number,
  flags: { isBlacklisted?: boolean; isTarget?: boolean; notes?: string },
): void {
  const current = getCompanyById(db, id);
  if (!current) return;
  prep(
    db,
    `UPDATE companies SET is_blacklisted = @bl, is_target = @tg, notes = @notes, updated_at = @ts WHERE id = @id`,
  ).run({
    id,
    bl: (flags.isBlacklisted ?? Boolean(current.is_blacklisted)) ? 1 : 0,
    tg: (flags.isTarget ?? Boolean(current.is_target)) ? 1 : 0,
    notes: flags.notes ?? current.notes,
    ts: nowIso(),
  });
}

// ----------------------------------------------------------------------------
// Vacancies
// ----------------------------------------------------------------------------

export interface UpsertVacancyResult {
  id: number;
  isNew: boolean;
  changed: boolean;
}

export function upsertVacancy(
  db: DB,
  v: NormalizedVacancy,
  companyId: number | null,
  contentHash: string,
): UpsertVacancyResult {
  const existing = prep(
    db,
    `SELECT id, content_hash FROM vacancies WHERE source = ? AND external_id = ?`,
  ).get(v.source, v.externalId) as
    | { id: number; content_hash: string }
    | undefined;

  const ts = nowIso();
  if (!existing) {
    const info = prep(
      db,
      `INSERT INTO vacancies (
          source, external_id, url, company_id, title, description, key_skills_json,
          salary_min, salary_max, salary_currency, salary_gross, location, remote_type,
          schedule, employment, experience, raw_payload_json, normalized_payload_json,
          content_hash, pipeline_status, created_at, updated_at, published_at
        ) VALUES (
          @source, @externalId, @url, @companyId, @title, @description, @keySkills,
          @salaryMin, @salaryMax, @salaryCurrency, @salaryGross, @location, @remoteType,
          @schedule, @employment, @experience, @raw, @normalized,
          @contentHash, 'normalized', @ts, @ts, @publishedAt
        )`,
    ).run({
      source: v.source,
      externalId: v.externalId,
      url: v.url,
      companyId,
      title: v.title,
      description: v.description,
      keySkills: JSON.stringify(v.keySkills),
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      salaryCurrency: v.salaryCurrency,
      salaryGross: v.salaryGross === null ? null : v.salaryGross ? 1 : 0,
      location: v.location,
      remoteType: v.remoteType,
      schedule: v.schedule,
      employment: v.employment,
      experience: v.experience,
      raw: JSON.stringify(v.raw),
      normalized: JSON.stringify(v),
      contentHash,
      ts,
      publishedAt: v.publishedAt,
    });
    return { id: Number(info.lastInsertRowid), isNew: true, changed: true };
  }

  if (existing.content_hash !== contentHash) {
    prep(
      db,
      `UPDATE vacancies SET
        url = @url, title = @title, description = @description, key_skills_json = @keySkills,
        salary_min = @salaryMin, salary_max = @salaryMax, salary_currency = @salaryCurrency,
        salary_gross = @salaryGross, location = @location, remote_type = @remoteType,
        schedule = @schedule, employment = @employment, experience = @experience,
        raw_payload_json = @raw, normalized_payload_json = @normalized, content_hash = @contentHash,
        pipeline_status = 'normalized', updated_at = @ts, published_at = @publishedAt
       WHERE id = @id`,
    ).run({
      id: existing.id,
      url: v.url,
      title: v.title,
      description: v.description,
      keySkills: JSON.stringify(v.keySkills),
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      salaryCurrency: v.salaryCurrency,
      salaryGross: v.salaryGross === null ? null : v.salaryGross ? 1 : 0,
      location: v.location,
      remoteType: v.remoteType,
      schedule: v.schedule,
      employment: v.employment,
      experience: v.experience,
      raw: JSON.stringify(v.raw),
      normalized: JSON.stringify(v),
      contentHash,
      ts,
      publishedAt: v.publishedAt,
    });
    return { id: existing.id, isNew: false, changed: true };
  }

  return { id: existing.id, isNew: false, changed: false };
}

export function getVacancyById(db: DB, id: number): VacancyRow | undefined {
  return prep(db, `SELECT * FROM vacancies WHERE id = ?`).get(id) as
    | VacancyRow
    | undefined;
}

export function listVacanciesByStatus(
  db: DB,
  status: PipelineStatus,
  limit = 100,
): VacancyRow[] {
  return prep(
    db,
    `SELECT * FROM vacancies WHERE pipeline_status = ? ORDER BY priority_score DESC, id ASC LIMIT ?`,
  ).all(status, limit) as VacancyRow[];
}

export function countVacancies(
  db: DB,
  filter: { status?: PipelineStatus; applyMode?: ApplyMode } = {},
): number {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    clauses.push("pipeline_status = ?");
    params.push(filter.status);
  }
  if (filter.applyMode) {
    clauses.push("apply_mode = ?");
    params.push(filter.applyMode);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const row = prep(db, `SELECT COUNT(*) AS n FROM vacancies ${where}`).get(
    ...params,
  ) as { n: number };
  return row.n;
}

export function setVacancyStatus(
  db: DB,
  id: number,
  status: PipelineStatus,
): void {
  prep(
    db,
    `UPDATE vacancies SET pipeline_status = ?, updated_at = ? WHERE id = ?`,
  ).run(status, nowIso(), id);
}

/** Marker stored in score_risks_json when score AI failed before retry logic existed. */
export const SCORE_AI_FAILURE_RISK = "AI classification failed";

/** Reset transient score failures back to normalized for the next score tick. */
export function requeueScoreFailures(db: DB, limit = 500): number {
  const rows = prep(
    db,
    `SELECT id FROM vacancies
     WHERE score_risks_json LIKE @pattern
       AND pipeline_status = 'queued'
     ORDER BY id ASC
     LIMIT @limit`,
  ).all({ pattern: `%${SCORE_AI_FAILURE_RISK}%`, limit }) as { id: number }[];

  if (rows.length === 0) return 0;

  const ts = nowIso();
  const reset = prep(
    db,
    `UPDATE vacancies SET
      pipeline_status = 'normalized',
      fit_score = NULL, salary_score = NULL, risk_score = NULL,
      priority_score = NULL, apply_mode = NULL,
      score_reasons_json = NULL, score_risks_json = NULL,
      updated_at = @ts
     WHERE id = @id`,
  );
  for (const row of rows) reset.run({ id: row.id, ts });

  const placeholders = rows.map(() => "?").join(",");
  prep(
    db,
    `UPDATE queues SET status = 'resolved', resolved_at = ?, updated_at = ?
     WHERE type = 'manual_review' AND entity_type = 'vacancy'
       AND entity_id IN (${placeholders}) AND status = 'open'`,
  ).run(ts, ts, ...rows.map((r) => r.id));

  return rows.length;
}

/** Reset rejected/scored vacancies back to normalized for a fresh score tick. */
export function requeueVacanciesForRescore(db: DB, ids: number[]): number {
  if (ids.length === 0) return 0;

  const existing = prep(
    db,
    `SELECT id FROM vacancies WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as { id: number }[];
  if (existing.length === 0) return 0;

  const ts = nowIso();
  const reset = prep(
    db,
    `UPDATE vacancies SET
      pipeline_status = 'normalized',
      fit_score = NULL, salary_score = NULL, risk_score = NULL,
      priority_score = NULL, apply_mode = NULL,
      score_reasons_json = NULL, score_risks_json = NULL,
      updated_at = @ts
     WHERE id = @id`,
  );
  for (const row of existing) reset.run({ id: row.id, ts });

  const requeuedIds = existing.map((r) => r.id);
  const placeholders = requeuedIds.map(() => "?").join(",");
  prep(
    db,
    `UPDATE queues SET status = 'resolved', resolved_at = ?, updated_at = ?
     WHERE entity_type = 'vacancy'
       AND entity_id IN (${placeholders}) AND status = 'open'`,
  ).run(ts, ts, ...requeuedIds);

  return requeuedIds.length;
}

/** Reset vacancies stuck mid-apply so the apply stage can retry them. */
export function requeueStuckApplying(
  db: DB,
  stuckMinutes = 30,
  limit = 50,
): number {
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000).toISOString();
  const rows = prep(
    db,
    `SELECT id FROM vacancies
     WHERE pipeline_status = 'applying' AND updated_at < @cutoff
     ORDER BY id ASC
     LIMIT @limit`,
  ).all({ cutoff, limit }) as { id: number }[];

  for (const row of rows) {
    setVacancyStatus(db, row.id, "packaged");
    const app = getApplicationByVacancy(db, row.id);
    if (app?.status === "applying") {
      updateApplicationStatus(db, app.id, { status: "packaged" });
    }
  }

  return rows.length;
}

export function updateVacancyScore(
  db: DB,
  id: number,
  score: {
    fitScore: number;
    salaryScore: number;
    riskScore: number;
    priorityScore: number;
    applyMode: ApplyMode;
    reasons: string[];
    risks: string[];
  },
): void {
  prep(
    db,
    `UPDATE vacancies SET
      fit_score = @fit, salary_score = @salary, risk_score = @risk, priority_score = @priority,
      apply_mode = @applyMode, score_reasons_json = @reasons, score_risks_json = @risks,
      pipeline_status = 'classified', updated_at = @ts
     WHERE id = @id`,
  ).run({
    id,
    fit: score.fitScore,
    salary: score.salaryScore,
    risk: score.riskScore,
    priority: score.priorityScore,
    applyMode: score.applyMode,
    reasons: JSON.stringify(score.reasons),
    risks: JSON.stringify(score.risks),
    ts: nowIso(),
  });
}

export interface ListVacancyFilter {
  status?: string;
  applyMode?: string;
  limit?: number;
  minPriority?: number;
}

export function listVacancies(
  db: DB,
  filter: ListVacancyFilter = {},
): VacancyRow[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.status) {
    clauses.push("pipeline_status = @status");
    params.status = filter.status;
  }
  if (filter.applyMode) {
    clauses.push("apply_mode = @applyMode");
    params.applyMode = filter.applyMode;
  }
  if (typeof filter.minPriority === "number") {
    clauses.push("priority_score >= @minPriority");
    params.minPriority = filter.minPriority;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.limit = filter.limit ?? 100;
  return prep(
    db,
    `SELECT * FROM vacancies ${where} ORDER BY priority_score DESC, id DESC LIMIT @limit`,
  ).all(params) as VacancyRow[];
}

// ----------------------------------------------------------------------------
// Applications + artifacts
// ----------------------------------------------------------------------------

export function getApplicationByVacancy(
  db: DB,
  vacancyId: number,
): ApplicationRow | undefined {
  return prep(db, `SELECT * FROM applications WHERE vacancy_id = ?`).get(
    vacancyId,
  ) as ApplicationRow | undefined;
}

export function createApplication(
  db: DB,
  input: {
    vacancyId: number;
    companyId: number | null;
    status: string;
    applyMode?: string | null;
    resumeVersion?: string | null;
    coverLetterVersion?: string | null;
    coverLetterText?: string | null;
  },
): ApplicationRow {
  const ts = nowIso();
  prep(
    db,
    `INSERT INTO applications (vacancy_id, company_id, status, apply_mode, resume_version, cover_letter_version, cover_letter_text, created_at, updated_at)
     VALUES (@vacancyId, @companyId, @status, @applyMode, @resumeVersion, @coverLetterVersion, @coverLetterText, @ts, @ts)
     ON CONFLICT (vacancy_id) DO UPDATE SET
       status = excluded.status,
       apply_mode = excluded.apply_mode,
       resume_version = COALESCE(excluded.resume_version, applications.resume_version),
       cover_letter_version = COALESCE(excluded.cover_letter_version, applications.cover_letter_version),
       cover_letter_text = COALESCE(excluded.cover_letter_text, applications.cover_letter_text),
       updated_at = @ts`,
  ).run({
    vacancyId: input.vacancyId,
    companyId: input.companyId,
    status: input.status,
    applyMode: input.applyMode ?? null,
    resumeVersion: input.resumeVersion ?? null,
    coverLetterVersion: input.coverLetterVersion ?? null,
    coverLetterText: input.coverLetterText ?? null,
    ts,
  });
  return getApplicationByVacancy(db, input.vacancyId)!;
}

export function updateApplicationStatus(
  db: DB,
  id: number,
  input: {
    status: string;
    appliedAt?: string | null;
    failureReason?: string | null;
    result?: string | null;
    nextActionAt?: string | null;
  },
): void {
  prep(
    db,
    `UPDATE applications SET
      status = @status,
      applied_at = COALESCE(@appliedAt, applied_at),
      failure_reason = @failureReason,
      result = COALESCE(@result, result),
      next_action_at = @nextActionAt,
      updated_at = @ts
     WHERE id = @id`,
  ).run({
    id,
    status: input.status,
    appliedAt: input.appliedAt ?? null,
    failureReason: input.failureReason ?? null,
    result: input.result ?? null,
    nextActionAt: input.nextActionAt ?? null,
    ts: nowIso(),
  });
}

export function addApplicationArtifact(
  db: DB,
  input: {
    applicationId: number;
    type: string;
    content?: string | null;
    filePath?: string | null;
    version?: string | null;
  },
): void {
  prep(
    db,
    `INSERT INTO application_artifacts (application_id, type, content, file_path, version, created_at)
     VALUES (@applicationId, @type, @content, @filePath, @version, @ts)`,
  ).run({
    applicationId: input.applicationId,
    type: input.type,
    content: input.content ?? null,
    filePath: input.filePath ?? null,
    version: input.version ?? null,
    ts: nowIso(),
  });
}

export function listApplications(db: DB, limit = 100): ApplicationRow[] {
  return prep(
    db,
    `SELECT * FROM applications ORDER BY updated_at DESC LIMIT ?`,
  ).all(limit) as ApplicationRow[];
}

export function countApplicationsToCompanySince(
  db: DB,
  companyId: number,
  sinceIso: string,
): number {
  const row = prep(
    db,
    `SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND created_at >= ?`,
  ).get(companyId, sinceIso) as { n: number };
  return row.n;
}

export function countApplicationsSince(
  db: DB,
  sinceIso: string,
  statuses: string[] = ["applied"],
): number {
  const placeholders = statuses.map(() => "?").join(",");
  const row = prep(
    db,
    `SELECT COUNT(*) AS n FROM applications WHERE created_at >= ? AND status IN (${placeholders})`,
  ).get(sinceIso, ...statuses) as { n: number };
  return row.n;
}

// ----------------------------------------------------------------------------
// Queues
// ----------------------------------------------------------------------------

export function enqueue(
  db: DB,
  input: {
    type: QueueType;
    entityType: string;
    entityId: number;
    reason?: string;
    priority?: number;
    payload?: unknown;
  },
): number {
  // Avoid duplicate open items for the same entity+type.
  const existing = prep(
    db,
    `SELECT id FROM queues WHERE type = ? AND entity_type = ? AND entity_id = ? AND status = 'open'`,
  ).get(input.type, input.entityType, input.entityId) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;

  const ts = nowIso();
  const info = prep(
    db,
    `INSERT INTO queues (type, entity_type, entity_id, status, priority, reason, payload_json, created_at, updated_at)
       VALUES (@type, @entityType, @entityId, 'open', @priority, @reason, @payload, @ts, @ts)`,
  ).run({
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    priority: input.priority ?? 0,
    reason: input.reason ?? null,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    ts,
  });
  return Number(info.lastInsertRowid);
}

export function listQueue(
  db: DB,
  type?: QueueType,
  status = "open",
  limit = 100,
): QueueRow[] {
  if (type) {
    return prep(
      db,
      `SELECT * FROM queues WHERE type = ? AND status = ? ORDER BY priority DESC, id ASC LIMIT ?`,
    ).all(type, status, limit) as QueueRow[];
  }
  return prep(
    db,
    `SELECT * FROM queues WHERE status = ? ORDER BY priority DESC, id ASC LIMIT ?`,
  ).all(status, limit) as QueueRow[];
}

export function resolveQueueItem(
  db: DB,
  id: number,
  status = "resolved",
): void {
  prep(
    db,
    `UPDATE queues SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
  ).run(status, nowIso(), nowIso(), id);
}

/** Resolve open queue rows matching optional type/entity filters. */
export function resolveOpenQueues(
  db: DB,
  filter: {
    type?: QueueType;
    entityType?: string;
    entityId?: number;
  },
): number {
  const clauses = ["status = 'open'"];
  const params: unknown[] = [];
  if (filter.type) {
    clauses.push("type = ?");
    params.push(filter.type);
  }
  if (filter.entityType) {
    clauses.push("entity_type = ?");
    params.push(filter.entityType);
  }
  if (filter.entityId !== undefined) {
    clauses.push("entity_id = ?");
    params.push(filter.entityId);
  }
  const ts = nowIso();
  const info = prep(
    db,
    `UPDATE queues SET status = 'resolved', resolved_at = ?, updated_at = ?
     WHERE ${clauses.join(" AND ")}`,
  ).run(ts, ts, ...params);
  return Number(info.changes);
}

/** Retry auto applies that failed transiently (playbook/selector), not captcha. */
export function requeueFailedAutoApplies(db: DB, limit = 50): number {
  const rows = prep(
    db,
    `SELECT v.id FROM vacancies v
     JOIN applications a ON a.vacancy_id = v.id
     WHERE v.pipeline_status = 'queued'
       AND v.apply_mode = 'auto'
       AND a.status = 'failed'
       AND a.failure_reason IN ('selector_broken', 'network_error', 'unknown_error')
     ORDER BY v.priority_score DESC, v.id ASC
     LIMIT ?`,
  ).all(limit) as { id: number }[];

  const ts = nowIso();
  for (const row of rows) {
    setVacancyStatus(db, row.id, "packaged");
    const app = getApplicationByVacancy(db, row.id);
    if (app) {
      updateApplicationStatus(db, app.id, {
        status: "packaged",
        failureReason: null,
      });
    }
    resolveOpenQueues(db, {
      type: "broken_selector",
      entityType: "vacancy",
      entityId: row.id,
    });
  }
  return rows.length;
}

/** Undo mistaken reject when apply gate hit a transient limit (vacancy still has packaged app). */
export function requeuePackagedAutoRejected(db: DB, limit = 100): number {
  const rows = prep(
    db,
    `SELECT v.id FROM vacancies v
     JOIN applications a ON a.vacancy_id = v.id
     WHERE v.pipeline_status = 'rejected'
       AND v.apply_mode = 'auto'
       AND a.status = 'packaged'
     ORDER BY v.priority_score DESC, v.id ASC
     LIMIT ?`,
  ).all(limit) as { id: number }[];

  for (const row of rows) {
    setVacancyStatus(db, row.id, "packaged");
  }
  return rows.length;
}

export function queueCounts(
  db: DB,
): Array<{ type: string; status: string; n: number }> {
  return prep(
    db,
    `SELECT type, status, COUNT(*) AS n FROM queues GROUP BY type, status ORDER BY type`,
  ).all() as Array<{ type: string; status: string; n: number }>;
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

export function logEvent(
  db: DB,
  input: {
    type: string;
    entityType?: string | null;
    entityId?: number | null;
    payload?: unknown;
  },
): number {
  const info = prep(
    db,
    `INSERT INTO events (type, entity_type, entity_id, payload_json, created_at)
       VALUES (@type, @entityType, @entityId, @payload, @ts)`,
  ).run({
    type: input.type,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    ts: nowIso(),
  });
  return Number(info.lastInsertRowid);
}

export function listEventsSince(
  db: DB,
  sinceIso: string,
  limit = 1000,
): EventRow[] {
  return prep(
    db,
    `SELECT * FROM events WHERE created_at >= ? ORDER BY created_at ASC LIMIT ?`,
  ).all(sinceIso, limit) as EventRow[];
}

export function countEventsSince(db: DB, sinceIso: string): number {
  const row = prep(
    db,
    `SELECT COUNT(*) AS n FROM events WHERE created_at >= ?`,
  ).get(sinceIso) as { n: number };
  return row.n;
}

// ----------------------------------------------------------------------------
// Playbooks
// ----------------------------------------------------------------------------

export interface PlaybookRow {
  id: number;
  source: string;
  type: string;
  status: string;
  version: number;
  capabilities_json: string | null;
  file_path: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export function getPlaybook(
  db: DB,
  source: string,
  type: string,
): PlaybookRow | undefined {
  return prep(db, `SELECT * FROM playbooks WHERE source = ? AND type = ?`).get(
    source,
    type,
  ) as PlaybookRow | undefined;
}

export function ensurePlaybook(
  db: DB,
  source: string,
  type: string,
  status = "draft",
): PlaybookRow {
  const existing = getPlaybook(db, source, type);
  if (existing) return existing;
  const ts = nowIso();
  prep(
    db,
    `INSERT INTO playbooks (source, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(source, type, status, ts, ts);
  return getPlaybook(db, source, type)!;
}

export function setPlaybookStatus(db: DB, id: number, status: string): void {
  prep(db, `UPDATE playbooks SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    nowIso(),
    id,
  );
}

export function recordPlaybookSuccess(db: DB, id: number): void {
  prep(
    db,
    `UPDATE playbooks SET last_success_at = ?, failure_count = 0, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), nowIso(), id);
}

export function recordPlaybookFailure(
  db: DB,
  id: number,
  disableThreshold: number,
): boolean {
  prep(
    db,
    `UPDATE playbooks SET last_failure_at = ?, failure_count = failure_count + 1, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), nowIso(), id);
  const row = prep(db, `SELECT failure_count FROM playbooks WHERE id = ?`).get(
    id,
  ) as { failure_count: number };
  if (row.failure_count >= disableThreshold) {
    setPlaybookStatus(db, id, "broken");
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// LLM generations
// ----------------------------------------------------------------------------

export function logGeneration(
  db: DB,
  input: {
    type: string;
    inputHash?: string | null;
    promptVersion?: string | null;
    outputText?: string | null;
    model?: string | null;
  },
): void {
  prep(
    db,
    `INSERT INTO llm_generations (type, input_hash, prompt_version, output_text, model, created_at)
     VALUES (@type, @inputHash, @promptVersion, @outputText, @model, @ts)`,
  ).run({
    type: input.type,
    inputHash: input.inputHash ?? null,
    promptVersion: input.promptVersion ?? null,
    outputText: input.outputText ?? null,
    model: input.model ?? null,
    ts: nowIso(),
  });
}

// ----------------------------------------------------------------------------
// Insights + reflection reports
// ----------------------------------------------------------------------------

export interface InsightRow {
  id: number;
  kind: string;
  summary: string;
  detail: string | null;
  recommendation: string | null;
  confidence: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export function insertInsight(
  db: DB,
  input: {
    kind: string;
    summary: string;
    detail?: string;
    recommendation?: string;
    confidence?: string;
    periodStart?: string;
    periodEnd?: string;
  },
): void {
  prep(
    db,
    `INSERT INTO insights (kind, summary, detail, recommendation, confidence, period_start, period_end, created_at)
     VALUES (@kind, @summary, @detail, @recommendation, @confidence, @periodStart, @periodEnd, @ts)`,
  ).run({
    kind: input.kind,
    summary: input.summary,
    detail: input.detail ?? null,
    recommendation: input.recommendation ?? null,
    confidence: input.confidence ?? "medium",
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    ts: nowIso(),
  });
}

export function listInsights(db: DB, limit = 50): InsightRow[] {
  return prep(
    db,
    `SELECT * FROM insights ORDER BY created_at DESC LIMIT ?`,
  ).all(limit) as InsightRow[];
}

export function insertReflectionReport(
  db: DB,
  input: {
    periodStart: string;
    periodEnd: string;
    reportMarkdown: string;
    metrics?: unknown;
    recommendations?: unknown;
  },
): void {
  prep(
    db,
    `INSERT INTO reflection_reports (period_start, period_end, report_markdown, metrics_json, recommendations_json, created_at)
     VALUES (@periodStart, @periodEnd, @reportMarkdown, @metrics, @recommendations, @ts)`,
  ).run({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    reportMarkdown: input.reportMarkdown,
    metrics: input.metrics ? JSON.stringify(input.metrics) : null,
    recommendations: input.recommendations
      ? JSON.stringify(input.recommendations)
      : null,
    ts: nowIso(),
  });
}

// ----------------------------------------------------------------------------
// Source cursors
// ----------------------------------------------------------------------------

export function getSourceCursor(db: DB, source: string): string | null {
  const row = prep(
    db,
    `SELECT last_published_at FROM source_cursors WHERE source = ?`,
  ).get(source) as { last_published_at: string | null } | undefined;
  return row?.last_published_at ?? null;
}

export function setSourceCursor(
  db: DB,
  source: string,
  lastPublishedAt: string,
): void {
  prep(
    db,
    `INSERT INTO source_cursors (source, last_published_at, updated_at)
     VALUES (@source, @lastPublishedAt, @ts)
     ON CONFLICT (source) DO UPDATE SET last_published_at = @lastPublishedAt, updated_at = @ts`,
  ).run({ source, lastPublishedAt, ts: nowIso() });
}

// ----------------------------------------------------------------------------
// Telegram messages
// ----------------------------------------------------------------------------

export interface TelegramMessageRow {
  id: number;
  kind: string;
  entity_type: string | null;
  entity_id: number | null;
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
  payload_json: string | null;
  delivery_status: string;
  error: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Reserve a (kind, entity) so we never send the same notification twice. */
export function claimTelegramDelivery(
  db: DB,
  input: {
    kind: string;
    entityType: string;
    entityId: number;
    chatId: string;
    payload?: unknown;
  },
): TelegramMessageRow | null {
  const existing = prep(
    db,
    `SELECT * FROM telegram_messages WHERE kind = ? AND entity_type = ? AND entity_id = ?`,
  ).get(input.kind, input.entityType, input.entityId) as
    | TelegramMessageRow
    | undefined;
  if (existing && existing.delivery_status === "sent") return null;
  if (existing && existing.delivery_status === "claimed") {
    // stale claim after 10 minutes
    const claimedMs = existing.claimed_at ? Date.parse(existing.claimed_at) : 0;
    if (Date.now() - claimedMs < 10 * 60 * 1000) return null;
  }
  const ts = nowIso();
  if (existing) {
    prep(
      db,
      `UPDATE telegram_messages SET delivery_status = 'claimed', claimed_at = @ts, telegram_chat_id = @chatId, payload_json = @payload, updated_at = @ts WHERE id = @id`,
    ).run({
      id: existing.id,
      ts,
      chatId: input.chatId,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return prep(db, `SELECT * FROM telegram_messages WHERE id = ?`).get(
      existing.id,
    ) as TelegramMessageRow;
  }
  const info = prep(
    db,
    `INSERT INTO telegram_messages (kind, entity_type, entity_id, telegram_chat_id, payload_json, delivery_status, claimed_at, created_at, updated_at)
       VALUES (@kind, @entityType, @entityId, @chatId, @payload, 'claimed', @ts, @ts, @ts)`,
  ).run({
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
    chatId: input.chatId,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    ts,
  });
  return prep(db, `SELECT * FROM telegram_messages WHERE id = ?`).get(
    Number(info.lastInsertRowid),
  ) as TelegramMessageRow;
}

export function markTelegramSent(
  db: DB,
  id: number,
  telegramMessageId: string,
): void {
  prep(
    db,
    `UPDATE telegram_messages SET delivery_status = 'sent', telegram_message_id = ?, error = NULL, updated_at = ? WHERE id = ?`,
  ).run(telegramMessageId, nowIso(), id);
}

export function markTelegramFailed(db: DB, id: number, error: string): void {
  prep(
    db,
    `UPDATE telegram_messages SET delivery_status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
  ).run(error, nowIso(), id);
}

// ----------------------------------------------------------------------------
// Funnel / reporting
// ----------------------------------------------------------------------------

export interface Funnel {
  vacanciesByStatus: Record<string, number>;
  applicationsByStatus: Record<string, number>;
  queuesByType: Record<string, number>;
}

export function getFunnel(db: DB): Funnel {
  const vacancyRows = prep(
    db,
    `SELECT pipeline_status AS s, COUNT(*) AS n FROM vacancies GROUP BY pipeline_status`,
  ).all() as Array<{ s: string; n: number }>;
  const appRows = prep(
    db,
    `SELECT status AS s, COUNT(*) AS n FROM applications GROUP BY status`,
  ).all() as Array<{ s: string; n: number }>;
  const queueRows = prep(
    db,
    `SELECT type AS s, COUNT(*) AS n FROM queues WHERE status = 'open' GROUP BY type`,
  ).all() as Array<{ s: string; n: number }>;

  const toMap = (
    rows: Array<{ s: string; n: number }>,
  ): Record<string, number> => Object.fromEntries(rows.map((r) => [r.s, r.n]));

  return {
    vacanciesByStatus: toMap(vacancyRows),
    applicationsByStatus: toMap(appRows),
    queuesByType: toMap(queueRows),
  };
}
