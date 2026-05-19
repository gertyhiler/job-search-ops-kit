import path from "node:path";
import { parseJsonLinesFile, parseJsonishFile } from "../core/json.ts";
import { getDataRoot, getStateRoot } from "../core/paths.ts";
import { migrateDatabase, openDatabase, resetProjectionTables, toJsonColumn } from "./database.ts";
import type {
  AgentRunRow,
  ApplicationEventRow,
  ApplicationRow,
  CoverLetterRow,
  InterviewRow,
  ResumeVersionRow,
  StrategyChangeRow,
  VacancyRow
} from "./schema.ts";

export interface ReplayDatabaseOptions {
  dbPath?: string;
  dataRoot?: string;
  stateRoot?: string;
  now?: Date;
}

function boolToSql(value: boolean | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return value ? 1 : 0;
}

async function readDirectoryJsonFiles(directoryPath: string, filter: (filePath: string) => boolean): Promise<any[]> {
  const { walkFiles } = await import("../core/fs.ts");
  const filePaths = await walkFiles(directoryPath);
  const matchingFiles = filePaths.filter(filter);
  return Promise.all(matchingFiles.map((filePath) => parseJsonishFile(filePath)));
}

async function loadVacancies(userDataRoot: string): Promise<VacancyRow[]> {
  const memoryRoot = path.join(userDataRoot, "memory", "vacancies");
  const rows = await readDirectoryJsonFiles(memoryRoot, (filePath) => filePath.endsWith(".json"));
  return rows.map((row) => ({
    ...row,
    tags: row.tags ?? []
  }));
}

async function loadApplications(userDataRoot: string): Promise<ApplicationRow[]> {
  const memoryRoot = path.join(userDataRoot, "memory", "applications");
  return readDirectoryJsonFiles(memoryRoot, (filePath) => filePath.endsWith(`${path.sep}application.json`));
}

async function loadCoverLetters(userDataRoot: string): Promise<CoverLetterRow[]> {
  const memoryRoot = path.join(userDataRoot, "memory", "applications");
  return readDirectoryJsonFiles(memoryRoot, (filePath) => filePath.endsWith(`${path.sep}cover-letter.json`));
}

async function loadInterviews(userDataRoot: string): Promise<InterviewRow[]> {
  const memoryRoot = path.join(userDataRoot, "memory", "applications");
  const rows = await readDirectoryJsonFiles(memoryRoot, (filePath) => filePath.endsWith(`${path.sep}interview.json`));
  return rows.map((row) => ({
    ...row,
    questions_asked: row.questions_asked ?? []
  }));
}

async function loadResumeVersions(userDataRoot: string): Promise<ResumeVersionRow[]> {
  const memoryRoot = path.join(userDataRoot, "memory", "resumes", "variants");
  return readDirectoryJsonFiles(memoryRoot, (filePath) => filePath.endsWith(".json") && !filePath.endsWith(".patch.json"));
}

async function loadApplicationEvents(userDataRoot: string): Promise<ApplicationEventRow[]> {
  const eventsDir = path.join(userDataRoot, "memory", "events");
  const { walkFiles } = await import("../core/fs.ts");
  const files = (await walkFiles(eventsDir)).filter((filePath) => filePath.endsWith(".jsonl"));
  const lines = await Promise.all(files.map((filePath) => parseJsonLinesFile(filePath)));
  return lines.flat().map((row) => ({
    id: row.id,
    application_id: row.application_id,
    ts: row.ts,
    kind: row.kind,
    payload: row.payload ?? null,
    evidence_ref: row.evidence_ref ?? null,
    emitted_by: row.emitted_by ?? null
  }));
}

async function loadStrategyChanges(userDataRoot: string): Promise<StrategyChangeRow[]> {
  const proposalDir = path.join(userDataRoot, "memory", "strategy", "change-proposals");
  const proposalRows = await readDirectoryJsonFiles(proposalDir, (filePath) => filePath.endsWith(".yaml") || filePath.endsWith(".json"));
  const decisionLogPath = path.join(userDataRoot, "memory", "strategy", "decision-log.jsonl");
  let decisions: any[] = [];
  try {
    decisions = await parseJsonLinesFile(decisionLogPath);
  } catch {
    decisions = [];
  }

  const decisionsByProposalId = new Map<string, any>(
    decisions
      .filter((row) => typeof row.proposal_id === "string")
      .map((row) => [row.proposal_id, row])
  );

  return proposalRows.map((proposal) => {
    const decision = decisionsByProposalId.get(proposal.id);
    return {
      id: proposal.id,
      ts: proposal.ts,
      before: proposal.before ?? {},
      after: proposal.after ?? {},
      rationale: proposal.rationale,
      evidence_refs: proposal.evidence_refs ?? [],
      expected_impact: proposal.expected_impact ?? null,
      confidence: proposal.confidence,
      reversibility: proposal.reversibility,
      proposed_by: proposal.proposed_by ?? null,
      decision: decision?.decision ?? proposal.decision ?? null,
      applied_version: decision?.applied_version ?? proposal.applied_version ?? null
    };
  });
}

async function loadAgentRuns(stateRoot: string): Promise<AgentRunRow[]> {
  const auditPath = path.join(stateRoot, "audit", "agent_runs.jsonl");
  try {
    const rows = await parseJsonLinesFile(auditPath);
    return rows.map((row) => ({
      id: row.id,
      ts_started: row.ts_started ?? row.ts ?? new Date(0).toISOString(),
      ts_finished: row.ts_finished ?? null,
      scheduled_for: row.scheduled_for ?? null,
      role: row.role ?? null,
      model: row.model ?? null,
      prompt_sha: row.prompt_sha ?? null,
      schedule_id: row.schedule_id ?? null,
      runner_adapter: row.runner_adapter ?? null,
      run_mode: row.run_mode ?? null,
      reasoning_effort: row.reasoning_effort ?? null,
      allow_tools: row.allow_tools ?? null,
      fallback_model: row.fallback_model ?? null,
      exit_code: row.exit_code ?? null,
      duration_ms: row.duration_ms ?? null,
      tool_calls_count: row.tool_calls_count ?? null,
      changed_paths: row.changed_paths ?? [],
      pty_session_id: row.pty_session_id ?? null,
      approval_state: row.approval_state ?? null,
      escalation_reason: row.escalation_reason ?? null,
      capabilities_used: row.capabilities_used ?? [],
      dry_run: row.dry_run ?? null,
      catchup: row.catchup ?? null,
      trigger: row.trigger ?? null,
      notes_path: row.notes_path ?? null
    }));
  } catch {
    return [];
  }
}

function deriveApplicationStatus(initialStatus: string, events: ApplicationEventRow[]): string {
  let status = initialStatus;
  const ordered = [...events].sort((left, right) => left.ts.localeCompare(right.ts));

  for (const event of ordered) {
    switch (event.kind) {
      case "applied":
        status = "applied";
        break;
      case "screened":
        status = "screened";
        break;
      case "invited":
      case "rescheduled":
      case "technical":
      case "final":
        status = "interviewing";
        break;
      case "offer":
        status = "offer";
        break;
      case "rejected":
        status = "rejected";
        break;
      case "withdrawn":
        status = "withdrawn";
        break;
      default:
        break;
    }
  }

  return status;
}

function deriveVacancyStatus(initialStatus: string, hasApplication: boolean): string {
  if (hasApplication) {
    return "applied";
  }
  return initialStatus;
}

function insertVacancies(db: any, rows: VacancyRow[]): void {
  const statement = db.prepare(`
    INSERT INTO vacancy (
      id, source, source_id, url, company, title, location, remote, salary_min, salary_max, currency,
      tags_json, jd_markdown_path, match_score, match_rationale, status, first_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.source,
      row.source_id ?? null,
      row.url ?? null,
      row.company,
      row.title,
      row.location ?? null,
      row.remote,
      row.salary_min ?? null,
      row.salary_max ?? null,
      row.currency ?? null,
      toJsonColumn(row.tags ?? []),
      row.jd_markdown_path ?? null,
      row.match_score ?? null,
      row.match_rationale ?? null,
      row.status,
      row.first_seen_at
    );
  }
}

function insertApplications(db: any, rows: ApplicationRow[]): void {
  const statement = db.prepare(`
    INSERT INTO application (
      id, vacancy_id, resume_version_id, cover_letter_id, channel, status, applied_at, confidence, auto_sent, dry_run
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.vacancy_id,
      row.resume_version_id ?? null,
      row.cover_letter_id ?? null,
      row.channel,
      row.status,
      row.applied_at ?? null,
      row.confidence ?? null,
      boolToSql(row.auto_sent),
      boolToSql(row.dry_run)
    );
  }
}

function insertApplicationEvents(db: any, rows: ApplicationEventRow[]): void {
  const statement = db.prepare(`
    INSERT INTO application_event (id, application_id, ts, kind, payload_json, evidence_ref, emitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.application_id,
      row.ts,
      row.kind,
      toJsonColumn(row.payload ?? null),
      row.evidence_ref ?? null,
      row.emitted_by ?? null
    );
  }
}

function insertResumeVersions(db: any, rows: ResumeVersionRow[]): void {
  const statement = db.prepare(`
    INSERT INTO resume_version (id, slug, base_commit_sha, patches_json_path, rendered_pdf_path, targeted_domain, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.slug,
      row.base_commit_sha,
      row.patches_json_path ?? null,
      row.rendered_pdf_path ?? null,
      row.targeted_domain ?? null,
      row.created_at
    );
  }
}

function insertCoverLetters(db: any, rows: CoverLetterRow[]): void {
  const statement = db.prepare(`
    INSERT INTO cover_letter (id, application_id, style, tone, markdown, sha, generated_by_model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.application_id,
      row.style ?? null,
      row.tone ?? null,
      row.markdown,
      row.sha,
      row.generated_by_model ?? null
    );
  }
}

function insertInterviews(db: any, rows: InterviewRow[]): void {
  const statement = db.prepare(`
    INSERT INTO interview (
      id, application_id, stage, scheduled_at, duration_min, format, notes_path, verdict, questions_asked_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.application_id,
      row.stage,
      row.scheduled_at,
      row.duration_min ?? null,
      row.format ?? null,
      row.notes_path ?? null,
      row.verdict ?? null,
      toJsonColumn(row.questions_asked ?? [])
    );
  }
}

function insertStrategyChanges(db: any, rows: StrategyChangeRow[]): void {
  const statement = db.prepare(`
    INSERT INTO strategy_change (
      id, ts, before_json, after_json, rationale, evidence_refs_json, expected_impact, confidence,
      reversibility, proposed_by, decision, applied_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.ts,
      toJsonColumn(row.before),
      toJsonColumn(row.after),
      row.rationale,
      toJsonColumn(row.evidence_refs ?? []),
      row.expected_impact ?? null,
      row.confidence,
      row.reversibility,
      row.proposed_by ?? null,
      row.decision ?? null,
      row.applied_version ?? null
    );
  }
}

function insertAgentRuns(db: any, rows: AgentRunRow[]): void {
  const statement = db.prepare(`
    INSERT INTO agent_run (
      id, ts_started, ts_finished, scheduled_for, role, model, prompt_sha, schedule_id, runner_adapter,
      run_mode, reasoning_effort, allow_tools, fallback_model, exit_code, duration_ms, tool_calls_count,
      changed_paths_json, pty_session_id, approval_state, escalation_reason, capabilities_used_json,
      dry_run, catchup, trigger, notes_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      row.id,
      row.ts_started,
      row.ts_finished ?? null,
      row.scheduled_for ?? null,
      row.role ?? null,
      row.model ?? null,
      row.prompt_sha ?? null,
      row.schedule_id ?? null,
      row.runner_adapter ?? null,
      row.run_mode ?? null,
      row.reasoning_effort ?? null,
      boolToSql(row.allow_tools),
      row.fallback_model ?? null,
      row.exit_code ?? null,
      row.duration_ms ?? null,
      row.tool_calls_count ?? null,
      toJsonColumn(row.changed_paths ?? []),
      row.pty_session_id ?? null,
      row.approval_state ?? null,
      row.escalation_reason ?? null,
      toJsonColumn(row.capabilities_used ?? []),
      boolToSql(row.dry_run),
      boolToSql(row.catchup),
      row.trigger ?? null,
      row.notes_path ?? null
    );
  }
}

export async function replayDatabase(options: ReplayDatabaseOptions = {}): Promise<{
  dbPath: string;
  rowCounts: Record<string, number>;
}> {
  const dataRoot = options.dataRoot ?? getDataRoot();
  const stateRoot = options.stateRoot ?? getStateRoot();
  const migration = await migrateDatabase({
    dbPath: options.dbPath,
    dataRoot,
    stateRoot,
    now: options.now
  });

  const db = await openDatabase(migration.dbPath);
  try {
    await resetProjectionTables(db);

    const [vacancies, applications, coverLetters, interviews, resumeVersions, events, strategyChanges, agentRuns] = await Promise.all([
      loadVacancies(dataRoot),
      loadApplications(dataRoot),
      loadCoverLetters(dataRoot),
      loadInterviews(dataRoot),
      loadResumeVersions(dataRoot),
      loadApplicationEvents(dataRoot),
      loadStrategyChanges(dataRoot),
      loadAgentRuns(stateRoot)
    ]);

    const eventsByApplication = new Map<string, ApplicationEventRow[]>();
    for (const event of events) {
      const bucket = eventsByApplication.get(event.application_id) ?? [];
      bucket.push(event);
      eventsByApplication.set(event.application_id, bucket);
    }

    const hydratedApplications = applications.map((application) => {
      const relatedEvents = eventsByApplication.get(application.id) ?? [];
      const appliedEvent = relatedEvents
        .filter((event) => event.kind === "applied")
        .sort((left, right) => left.ts.localeCompare(right.ts))[0];

      return {
        ...application,
        status: deriveApplicationStatus(application.status, relatedEvents),
        applied_at: application.applied_at ?? appliedEvent?.ts ?? null
      };
    });

    const applicationVacancyIds = new Set(hydratedApplications.map((application) => application.vacancy_id));
    const hydratedVacancies = vacancies.map((vacancy) => ({
      ...vacancy,
      status: deriveVacancyStatus(vacancy.status, applicationVacancyIds.has(vacancy.id))
    }));

    db.exec("BEGIN");
    try {
      insertVacancies(db, hydratedVacancies);
      insertApplications(db, hydratedApplications);
      insertApplicationEvents(db, events);
      insertResumeVersions(db, resumeVersions);
      insertCoverLetters(db, coverLetters);
      insertInterviews(db, interviews);
      insertStrategyChanges(db, strategyChanges);
      insertAgentRuns(db, agentRuns);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      dbPath: migration.dbPath,
      rowCounts: {
        vacancy: hydratedVacancies.length,
        application: hydratedApplications.length,
        application_event: events.length,
        resume_version: resumeVersions.length,
        cover_letter: coverLetters.length,
        interview: interviews.length,
        strategy_change: strategyChanges.length,
        agent_run: agentRuns.length
      }
    };
  } finally {
    db.close();
  }
}
