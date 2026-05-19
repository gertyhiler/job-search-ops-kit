import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  appendJsonLineFile,
  assertValidAgainstSchema,
  bootstrapOperatorEnvironment,
  ensureDirectory,
  getAppRoot,
  getOperatorWorkflowStatus,
  getRepoRoot,
  parseJsonLinesFile,
  parseJsonishFile,
  pathExists,
  resolvePath,
  resolveStatePath,
  writeJsonishFile
} from "../core/index.ts";
import { dumpTables, migrateDatabase, parseJsonColumn, replayDatabase } from "../db/index.ts";

type JsonRecord = Record<string, unknown>;

interface ServiceRoots {
  dataRoot?: string;
  stateRoot?: string;
}

interface AuditEntry {
  ts: string;
  tool: string;
  args: unknown;
  changed_paths?: string[];
}

interface ToolResult {
  tool: string;
  result: unknown;
}

const replayLocks = new Map<string, Promise<void>>();

function schemaPath(fileName: string): string {
  return path.join(getAppRoot(), "schemas", fileName);
}

async function loadSchema(fileName: string): Promise<any> {
  const appSchemaPath = schemaPath(fileName);
  if (process.env.JOB_SEARCH_APP_ROOT?.trim() && await pathExists(appSchemaPath)) {
    return parseJsonishFile(appSchemaPath);
  }
  return parseJsonishFile(path.join(getRepoRoot(), "schemas", fileName));
}

function hashContent(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function safeSlug(value: string): string {
  const slug = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "session";
}

async function safeParseJsonish(filePath: string, fallback: unknown): Promise<any> {
  if (!(await pathExists(filePath))) {
    return fallback;
  }
  return parseJsonishFile(filePath);
}

async function readJsonLinesIfExists(filePath: string): Promise<any[]> {
  if (!(await pathExists(filePath))) {
    return [];
  }
  return parseJsonLinesFile(filePath);
}

async function findJsonObjectById(directoryPath: string, id: string): Promise<any | null> {
  if (!(await pathExists(directoryPath))) {
    return null;
  }

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(directoryPath, entry.name);
    const payload = await parseJsonishFile(filePath);
    if (payload?.id === id) {
      return payload;
    }
  }

  return null;
}

export class JobSearchService {
  private readonly dataRoot: string;
  private readonly stateRoot: string;

  constructor(roots: ServiceRoots = {}) {
    this.dataRoot = roots.dataRoot ?? resolvePath("dataRoot");
    this.stateRoot = roots.stateRoot ?? resolveStatePath("stateRoot");
  }

  private async ensureProjection(): Promise<void> {
    await migrateDatabase({ dataRoot: this.dataRoot, stateRoot: this.stateRoot });
  }

  private async replayProjection(): Promise<void> {
    const previous = replayLocks.get(this.stateRoot) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        await replayDatabase({ dataRoot: this.dataRoot, stateRoot: this.stateRoot });
      });
    replayLocks.set(this.stateRoot, current);
    try {
      await current;
    } finally {
      if (replayLocks.get(this.stateRoot) === current) {
        replayLocks.delete(this.stateRoot);
      }
    }
  }

  private async appendAudit(entry: AuditEntry): Promise<void> {
    const auditPath = path.join(this.stateRoot, "audit", "mcp-tool-calls.jsonl");
    await appendJsonLineFile(auditPath, entry);
  }

  private async listVacancyRows(): Promise<any[]> {
    await this.replayProjection();
    const tables = await dumpTables(path.join(this.stateRoot, "job-search.db"));
    return tables.vacancy.map((row: any) => ({
      ...row,
      tags: parseJsonColumn<string[]>(row.tags_json),
      tags_json: undefined
    }));
  }

  private async listApplicationRows(): Promise<any[]> {
    await this.replayProjection();
    const tables = await dumpTables(path.join(this.stateRoot, "job-search.db"));
    return tables.application;
  }

  private async listEventRows(): Promise<any[]> {
    await this.replayProjection();
    const tables = await dumpTables(path.join(this.stateRoot, "job-search.db"));
    return tables.application_event.map((row: any) => ({
      ...row,
      payload: parseJsonColumn(row.payload_json)
    }));
  }

  private async listScheduleRows(): Promise<any[]> {
    await this.ensureProjection();
    const tables = await dumpTables(path.join(this.stateRoot, "job-search.db"));
    return tables.schedule;
  }

  private async resolveApplicationPaths(applicationId: string): Promise<{
    applicationPath: string;
    coverLetterPath: string;
    directoryPath: string;
    interviewPath: string;
    outboxPath: string;
    reviewerVerdictPath: string;
    screeningAnswersPath: string;
    letterMarkdownPath: string;
    resumeVariantRefPath: string;
  }> {
    const directoryPath = path.join(this.dataRoot, "memory", "applications", applicationId);
    return {
      applicationPath: path.join(directoryPath, "application.json"),
      coverLetterPath: path.join(directoryPath, "cover-letter.json"),
      directoryPath,
      interviewPath: path.join(directoryPath, "interview.json"),
      outboxPath: path.join(directoryPath, "outbox.json"),
      reviewerVerdictPath: path.join(directoryPath, "reviewer-verdict.json"),
      screeningAnswersPath: path.join(directoryPath, "answers.md"),
      letterMarkdownPath: path.join(directoryPath, "letter.md"),
      resumeVariantRefPath: path.join(directoryPath, "resume-variant-ref.json")
    };
  }

  private async resolveVacancyPath(vacancyId: string): Promise<string> {
    return path.join(this.dataRoot, "memory", "vacancies", `${vacancyId}.json`);
  }

  private async resolveProposalPath(proposalId: string): Promise<string> {
    return path.join(this.dataRoot, "memory", "strategy", "change-proposals", `${proposalId}.yaml`);
  }

  async listVacancies(args: { limit?: number; status?: string | null } = {}): Promise<ToolResult> {
    const rows = await this.listVacancyRows();
    const filtered = rows.filter((row) => !args.status || row.status === args.status);
    return {
      tool: "list_vacancies",
      result: filtered.slice(0, args.limit ?? 50)
    };
  }

  async getVacancy(args: { id: string }): Promise<ToolResult> {
    const filePath = await this.resolveVacancyPath(args.id);
    const vacancy = await safeParseJsonish(
      filePath,
      await findJsonObjectById(path.join(this.dataRoot, "memory", "vacancies"), args.id)
    );
    if (!vacancy) {
      throw new Error(`Vacancy not found: ${args.id}`);
    }
    return {
      tool: "get_vacancy",
      result: vacancy
    };
  }

  async getApplicationPack(args: { id: string }): Promise<ToolResult> {
    const paths = await this.resolveApplicationPaths(args.id);
    const application = await safeParseJsonish(paths.applicationPath, null);
    if (!application) {
      throw new Error(`Application not found: ${args.id}`);
    }

    const coverLetter = await safeParseJsonish(paths.coverLetterPath, null);
    const interview = await safeParseJsonish(paths.interviewPath, null);
    const reviewerVerdict = await safeParseJsonish(paths.reviewerVerdictPath, null);
    const outbox = await safeParseJsonish(paths.outboxPath, null);
    const resumeVariantRef = await safeParseJsonish(paths.resumeVariantRefPath, null);
    const letterMarkdown = await ((await pathExists(paths.letterMarkdownPath)) ? fs.readFile(paths.letterMarkdownPath, "utf8") : Promise.resolve(null));
    const screeningAnswers = await ((await pathExists(paths.screeningAnswersPath)) ? fs.readFile(paths.screeningAnswersPath, "utf8") : Promise.resolve(null));
    const vacancyPath = await this.resolveVacancyPath(String(application.vacancy_id));
    const vacancy = await safeParseJsonish(
      vacancyPath,
      await findJsonObjectById(path.join(this.dataRoot, "memory", "vacancies"), String(application.vacancy_id))
    );
    const events = (await readJsonLinesIfExists(path.join(this.dataRoot, "memory", "events", "application-events.jsonl")))
      .filter((event) => event.application_id === args.id);

    return {
      tool: "get_application_pack",
      result: {
        application,
        cover_letter: coverLetter,
        letter_markdown: letterMarkdown,
        screening_answers_markdown: screeningAnswers,
        resume_variant_ref: resumeVariantRef,
        reviewer_verdict: reviewerVerdict,
        outbox,
        interview,
        vacancy,
        events
      }
    };
  }

  async listApplications(args: {
    channel?: string | null;
    limit?: number;
    status?: string | null;
    vacancy_id?: string | null;
  } = {}): Promise<ToolResult> {
    const rows = await this.listApplicationRows();
    const filtered = rows.filter((row) => {
      if (args.status && row.status !== args.status) {
        return false;
      }
      if (args.vacancy_id && row.vacancy_id !== args.vacancy_id) {
        return false;
      }
      if (args.channel && row.channel !== args.channel) {
        return false;
      }
      return true;
    });

    return {
      tool: "list_applications",
      result: filtered.slice(0, args.limit ?? 50)
    };
  }

  async getFunnel(): Promise<ToolResult> {
    const applications = await this.listApplicationRows();
    const events = await this.listEventRows();
    const statusCounts = new Map<string, number>();

    for (const application of applications) {
      statusCounts.set(application.status, (statusCounts.get(application.status) ?? 0) + 1);
    }

    const applied = events.filter((event) => event.kind === "applied").length;
    const responded = events.filter((event) => ["screened", "invited", "technical", "final", "offer"].includes(event.kind)).length;

    return {
      tool: "get_funnel",
      result: {
        total_applications: applications.length,
        statuses: Object.fromEntries(statusCounts.entries()),
        response_rate: applied === 0 ? 0 : responded / applied,
        events_last_seen_at: events.at(-1)?.ts ?? null
      }
    };
  }

  async searchPerformance(): Promise<ToolResult> {
    const summaryPath = path.join(this.dataRoot, "memory", "performance", "weekly-summary.yaml");
    const summary = await safeParseJsonish(summaryPath, {});
    const events = await this.listEventRows();
    return {
      tool: "search_performance",
      result: {
        summary,
        event_counts: events.reduce<Record<string, number>>((acc, event) => {
          acc[event.kind] = (acc[event.kind] ?? 0) + 1;
          return acc;
        }, {})
      }
    };
  }

  async listSchedules(args: { dueOnly?: boolean } = {}): Promise<ToolResult> {
    const rows = await this.listScheduleRows();
    const now = Date.now();
    const filtered = args.dueOnly
      ? rows.filter((row) => row.enabled && Date.parse(row.next_run_at) <= now)
      : rows;

    return {
      tool: "list_schedules",
      result: filtered
    };
  }

  async nextActions(args: { horizon?: "today" | "week" } = {}): Promise<ToolResult> {
    const applications = await this.listApplicationRows();
    const schedules = (await this.listSchedules({ dueOnly: true })).result as any[];
    const actions: Array<Record<string, unknown>> = applications
      .filter((application) => ["draft", "dry_run", "ready_to_send", "screened", "interviewing", "offer"].includes(application.status))
      .map((application) => ({
        kind: "application_followup",
        application_id: application.id,
        status: application.status,
        due: application.applied_at ?? null
      }));

    for (const schedule of schedules) {
      actions.push({
        kind: "scheduled_run",
        schedule_id: schedule.id,
        role: schedule.role,
        due: schedule.next_run_at
      });
    }

    return {
      tool: "next_actions",
      result: {
        horizon: args.horizon ?? "today",
        actions: actions.slice(0, 3)
      }
    };
  }

  async getOperatorStatus(): Promise<ToolResult> {
    return {
      tool: "get_operator_status",
      result: await getOperatorWorkflowStatus({
        appRoot: getAppRoot(),
        dataRoot: this.dataRoot,
        stateRoot: this.stateRoot
      })
    };
  }

  async bootstrapOperator(): Promise<ToolResult> {
    const bootstrap = await bootstrapOperatorEnvironment({
      dataRoot: this.dataRoot,
      stateRoot: this.stateRoot
    });
    await this.replayProjection();
    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "bootstrap_operator",
      args: {}
    });

    return {
      tool: "bootstrap_operator",
      result: {
        bootstrap,
        status: await getOperatorWorkflowStatus({
          appRoot: getAppRoot(),
          dataRoot: this.dataRoot,
          stateRoot: this.stateRoot
        })
      }
    };
  }

  async writeOnboardingProfile(args: {
    profile: JsonRecord;
    resume_text?: string | null;
    resume_json?: JsonRecord | null;
    active_strategy?: JsonRecord | null;
    answers_markdown?: string | null;
    source_note?: string | null;
  }): Promise<ToolResult> {
    await bootstrapOperatorEnvironment({
      dataRoot: this.dataRoot,
      stateRoot: this.stateRoot
    });

    const profileSchema = await loadSchema("profile.schema.json");
    assertValidAgainstSchema(profileSchema, args.profile, "profile");

    const changedPaths: string[] = [];
    const profilePath = path.join(this.dataRoot, "memory", "profile", "profile.snapshot.json");
    await writeJsonishFile(profilePath, args.profile);
    changedPaths.push(profilePath);

    if (args.resume_json) {
      const resumePath = path.join(this.dataRoot, "memory", "profile", "master-resume.json");
      await writeJsonishFile(resumePath, args.resume_json);
      changedPaths.push(resumePath);
    }

    if (args.resume_text) {
      const resumePath = path.join(this.dataRoot, "memory", "profile", "master-resume.md");
      await fs.writeFile(resumePath, `${args.resume_text.trim()}\n`, "utf8");
      changedPaths.push(resumePath);
    }

    if (args.active_strategy) {
      const strategySchema = await loadSchema("strategy.schema.json");
      assertValidAgainstSchema(strategySchema, args.active_strategy, "active strategy");
      const strategyPath = path.join(this.dataRoot, "memory", "strategy", "active-strategy.yaml");
      await writeJsonishFile(strategyPath, args.active_strategy);
      changedPaths.push(strategyPath);
    }

    if (args.answers_markdown || args.source_note) {
      const answersPath = path.join(this.dataRoot, "memory", "onboarding", "answers.md");
      await ensureDirectory(path.dirname(answersPath));
      await fs.writeFile(answersPath, [
        "# Onboarding Answers",
        "",
        args.source_note ? `Source: ${args.source_note}` : null,
        args.answers_markdown?.trim() ?? null,
        ""
      ].filter((line): line is string => line != null).join("\n"), "utf8");
      changedPaths.push(answersPath);
    }

    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "write_onboarding_profile",
      args: {
        has_profile: true,
        has_resume_json: Boolean(args.resume_json),
        resume_text_hash: args.resume_text ? hashContent(args.resume_text) : null,
        has_active_strategy: Boolean(args.active_strategy),
        has_answers_markdown: Boolean(args.answers_markdown),
        source_note: args.source_note ?? null
      },
      changed_paths: changedPaths
    });
    await this.replayProjection();

    return {
      tool: "write_onboarding_profile",
      result: {
        changed_paths: changedPaths,
        status: await getOperatorWorkflowStatus({
          appRoot: getAppRoot(),
          dataRoot: this.dataRoot,
          stateRoot: this.stateRoot
        })
      }
    };
  }

  async writeSessionLog(args: {
    session_id: string;
    summary_markdown: string;
    tool_calls?: JsonRecord[] | null;
    changed_paths?: string[] | null;
    blockers?: string[] | null;
    next_actions?: string[] | null;
    ts?: string | null;
  }): Promise<ToolResult> {
    await bootstrapOperatorEnvironment({
      dataRoot: this.dataRoot,
      stateRoot: this.stateRoot
    });

    const ts = args.ts ?? new Date().toISOString();
    const day = ts.slice(0, 10);
    const logPath = path.join(this.dataRoot, "memory", "session-logs", `${day}-${safeSlug(args.session_id)}.md`);
    const lines = [
      `# Operator Session ${args.session_id}`,
      "",
      `- ts: ${ts}`,
      `- changed_paths: ${(args.changed_paths ?? []).length}`,
      `- tool_calls: ${(args.tool_calls ?? []).length}`,
      "",
      "## Summary",
      "",
      args.summary_markdown.trim(),
      "",
      "## Tool Calls",
      "",
      ...(args.tool_calls ?? []).map((toolCall) => `- ${toolCall.name ?? toolCall.tool ?? "unknown"}: ${toolCall.status ?? "recorded"}`),
      "",
      "## Changed Paths",
      "",
      ...(args.changed_paths ?? []).map((changedPath) => `- ${changedPath}`),
      "",
      "## Blockers",
      "",
      ...(args.blockers ?? []).map((blocker) => `- ${blocker}`),
      "",
      "## Next Actions",
      "",
      ...(args.next_actions ?? []).map((action) => `- ${action}`),
      ""
    ];

    await ensureDirectory(path.dirname(logPath));
    await fs.writeFile(logPath, lines.join("\n"), "utf8");
    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "write_session_log",
      args,
      changed_paths: [logPath]
    });

    return {
      tool: "write_session_log",
      result: {
        session_id: args.session_id,
        path: logPath
      }
    };
  }

  async writeJournalEntry(args: {
    entry_id: string;
    summary_markdown: string;
    period?: string | null;
    role?: string | null;
    evidence_refs?: string[] | null;
    changed_paths?: string[] | null;
    ts?: string | null;
  }): Promise<ToolResult> {
    await bootstrapOperatorEnvironment({
      dataRoot: this.dataRoot,
      stateRoot: this.stateRoot
    });

    const ts = args.ts ?? new Date().toISOString();
    const day = ts.slice(0, 10);
    const year = day.slice(0, 4);
    const journalPath = path.join(this.dataRoot, "memory", "journal", year, `${day}-${safeSlug(args.entry_id)}.md`);
    const lines = [
      `# Journal ${args.entry_id}`,
      "",
      `- ts: ${ts}`,
      `- period: ${args.period ?? day}`,
      `- role: ${args.role ?? "unknown"}`,
      "",
      "## Summary",
      "",
      args.summary_markdown.trim(),
      "",
      "## Evidence",
      "",
      ...(args.evidence_refs ?? []).map((evidenceRef) => `- ${evidenceRef}`),
      "",
      "## Changed Paths",
      "",
      ...(args.changed_paths ?? []).map((changedPath) => `- ${changedPath}`),
      ""
    ];

    await ensureDirectory(path.dirname(journalPath));
    await fs.writeFile(journalPath, lines.join("\n"), "utf8");
    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "write_journal_entry",
      args,
      changed_paths: [journalPath]
    });

    return {
      tool: "write_journal_entry",
      result: {
        entry_id: args.entry_id,
        path: journalPath
      }
    };
  }

  async createVacancy(args: { vacancy: JsonRecord; markdown?: string | null }): Promise<ToolResult> {
    const schema = await loadSchema("vacancy.schema.json");
    assertValidAgainstSchema(schema, args.vacancy, "vacancy");
    await this.appendAudit({ ts: new Date().toISOString(), tool: "create_vacancy", args });

    const vacancyPath = await this.resolveVacancyPath(String(args.vacancy.id));
    await writeJsonishFile(vacancyPath, { tags: [], ...args.vacancy });

    if (args.markdown) {
      const markdownPath = path.join(this.dataRoot, "memory", "vacancies", `${args.vacancy.id}.md`);
      await fs.writeFile(markdownPath, args.markdown, "utf8");
    }

    await this.replayProjection();
    return {
      tool: "create_vacancy",
      result: { id: args.vacancy.id, path: vacancyPath }
    };
  }

  async createApplication(args: { application: JsonRecord; cover_letter?: JsonRecord | null }): Promise<ToolResult> {
    const schema = await loadSchema("application.schema.json");
    assertValidAgainstSchema(schema, args.application, "application");

    const paths = await this.resolveApplicationPaths(String(args.application.id));
    await ensureDirectory(paths.directoryPath);
    await writeJsonishFile(paths.applicationPath, args.application);
    const changedPaths = [paths.applicationPath];

    if (args.cover_letter) {
      await writeJsonishFile(paths.coverLetterPath, args.cover_letter);
      changedPaths.push(paths.coverLetterPath);
    }

    await this.appendAudit({ ts: new Date().toISOString(), tool: "create_application", args, changed_paths: changedPaths });
    await this.replayProjection();
    return {
      tool: "create_application",
      result: { id: args.application.id, path: paths.applicationPath }
    };
  }

  async createApplicationPackage(args: {
    application: JsonRecord;
    cover_letter?: JsonRecord | null;
    letter_markdown?: string | null;
    screening_answers_markdown?: string | null;
    resume_variant_ref?: JsonRecord | null;
    reviewer_verdict?: JsonRecord | null;
    outbox?: JsonRecord | null;
  }): Promise<ToolResult> {
    const created = await this.createApplication({
      application: {
        dry_run: true,
        auto_sent: false,
        ...args.application
      },
      cover_letter: args.cover_letter ?? null
    });
    const applicationId = String(args.application.id);
    const paths = await this.resolveApplicationPaths(applicationId);
    const changedPaths = [paths.applicationPath];

    if (args.cover_letter) {
      changedPaths.push(paths.coverLetterPath);
    }
    if (args.letter_markdown) {
      await fs.writeFile(paths.letterMarkdownPath, args.letter_markdown, "utf8");
      changedPaths.push(paths.letterMarkdownPath);
    }
    if (args.screening_answers_markdown) {
      await fs.writeFile(paths.screeningAnswersPath, args.screening_answers_markdown, "utf8");
      changedPaths.push(paths.screeningAnswersPath);
    }
    if (args.resume_variant_ref) {
      await writeJsonishFile(paths.resumeVariantRefPath, args.resume_variant_ref);
      changedPaths.push(paths.resumeVariantRefPath);
    }
    if (args.reviewer_verdict) {
      await writeJsonishFile(paths.reviewerVerdictPath, args.reviewer_verdict);
      changedPaths.push(paths.reviewerVerdictPath);
    }
    if (args.outbox) {
      await writeJsonishFile(paths.outboxPath, args.outbox);
      changedPaths.push(paths.outboxPath);
    }

    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "create_application_package",
      args,
      changed_paths: changedPaths
    });
    await this.replayProjection();
    return {
      tool: "create_application_package",
      result: {
        ...(created.result as JsonRecord),
        changed_paths: changedPaths
      }
    };
  }

  async writeApplicationAsset(args: {
    application_id: string;
    kind: "letter_markdown" | "screening_answers_markdown" | "resume_variant_ref" | "reviewer_verdict" | "outbox";
    content?: string | null;
    payload?: JsonRecord | null;
  }): Promise<ToolResult> {
    const paths = await this.resolveApplicationPaths(args.application_id);
    const application = await safeParseJsonish(paths.applicationPath, null);
    if (!application) {
      throw new Error(`Application not found: ${args.application_id}`);
    }

    const filePathByKind = {
      letter_markdown: paths.letterMarkdownPath,
      screening_answers_markdown: paths.screeningAnswersPath,
      resume_variant_ref: paths.resumeVariantRefPath,
      reviewer_verdict: paths.reviewerVerdictPath,
      outbox: paths.outboxPath
    };
    const filePath = filePathByKind[args.kind];

    if (args.kind === "letter_markdown" || args.kind === "screening_answers_markdown") {
      await fs.writeFile(filePath, args.content ?? "", "utf8");
    } else {
      await writeJsonishFile(filePath, args.payload ?? {});
    }

    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "write_application_asset",
      args,
      changed_paths: [filePath]
    });
    return {
      tool: "write_application_asset",
      result: { application_id: args.application_id, kind: args.kind, path: filePath }
    };
  }

  async updateApplicationStatus(args: {
    id: string;
    status: string;
    reason?: string | null;
    evidence_ref?: string | null;
    human_confirmation?: boolean | null;
  }): Promise<ToolResult> {
    const allowedStatuses = new Set([
      "draft",
      "dry_run",
      "review_blocked",
      "ready_to_send",
      "outbox_prepared",
      "applied",
      "screened",
      "interviewing",
      "offer",
      "rejected",
      "withdrawn",
      "archived"
    ]);
    if (!allowedStatuses.has(args.status)) {
      throw new Error(`Unsupported application status "${args.status}".`);
    }
    if (args.status === "applied" && (!args.human_confirmation || !args.evidence_ref)) {
      throw new Error("Applied status requires evidence_ref and human_confirmation=true.");
    }

    const schema = await loadSchema("application.schema.json");
    const paths = await this.resolveApplicationPaths(args.id);
    const application = await safeParseJsonish(paths.applicationPath, null);
    if (!application) {
      throw new Error(`Application not found: ${args.id}`);
    }

    const updated = {
      ...application,
      status: args.status,
      applied_at: application.applied_at ?? null,
      dry_run: args.status === "dry_run" || args.status === "draft" || args.status === "review_blocked",
      auto_sent: application.auto_sent ?? false,
      last_status_reason: args.reason ?? null,
      last_status_evidence_ref: args.evidence_ref ?? null,
      last_status_human_confirmation: args.human_confirmation ?? false
    };
    assertValidAgainstSchema(schema, updated, "application");
    await writeJsonishFile(paths.applicationPath, updated);
    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "update_application_status",
      args,
      changed_paths: [paths.applicationPath]
    });
    await this.replayProjection();

    return {
      tool: "update_application_status",
      result: { id: args.id, status: args.status, path: paths.applicationPath }
    };
  }

  async logEvent(args: {
    event: JsonRecord;
    evidence_text?: string | null;
    evidence_name?: string | null;
    human_confirmation?: boolean | null;
  }): Promise<ToolResult> {
    const schema = await loadSchema("application-event.schema.json");
    const event = { ...args.event };
    assertValidAgainstSchema(schema, event, "event");
    if (event.kind === "applied" && !args.human_confirmation) {
      throw new Error("Applied events require human_confirmation=true.");
    }

    if (args.evidence_text) {
      const evidenceFileName = args.evidence_name ?? `${event.id}.txt`;
      const evidencePath = path.join(this.dataRoot, "memory", "evidence", evidenceFileName);
      await ensureDirectory(path.dirname(evidencePath));
      await fs.writeFile(evidencePath, args.evidence_text, "utf8");
      event.evidence_ref = path.relative(this.dataRoot, evidencePath).replace(/\\/g, "/");
    }
    if (event.kind === "applied" && !event.evidence_ref) {
      throw new Error("Applied events require evidence_ref or evidence_text.");
    }

    const eventsPath = path.join(this.dataRoot, "memory", "events", "application-events.jsonl");
    await appendJsonLineFile(eventsPath, event);
    await this.appendAudit({
      ts: new Date().toISOString(),
      tool: "log_event",
      args,
      changed_paths: [eventsPath, ...(event.evidence_ref ? [path.join(this.dataRoot, String(event.evidence_ref))] : [])]
    });
    await this.replayProjection();

    return {
      tool: "log_event",
      result: event
    };
  }

  async proposeStrategyChange(args: { proposal: JsonRecord }): Promise<ToolResult> {
    const schema = await loadSchema("strategy-change-proposal.schema.json");
    assertValidAgainstSchema(schema, args.proposal, "proposal");
    await this.appendAudit({ ts: new Date().toISOString(), tool: "propose_strategy_change", args });

    const proposalPath = await this.resolveProposalPath(String(args.proposal.id));
    await writeJsonishFile(proposalPath, args.proposal);
    await this.replayProjection();

    return {
      tool: "propose_strategy_change",
      result: { id: args.proposal.id, path: proposalPath }
    };
  }

  async autoDecideStrategy(args: { proposal?: JsonRecord; proposal_id?: string }): Promise<ToolResult> {
    const proposal = args.proposal ?? await safeParseJsonish(
      await this.resolveProposalPath(String(args.proposal_id)),
      null
    );

    if (!proposal) {
      throw new Error("Strategy proposal is required.");
    }

    const activeStrategyPath = path.join(this.dataRoot, "memory", "strategy", "active-strategy.yaml");
    const activeStrategy = await safeParseJsonish(activeStrategyPath, {});
    const decisionLogPath = path.join(this.dataRoot, "memory", "strategy", "decision-log.jsonl");
    const decisions = await readJsonLinesIfExists(decisionLogPath);
    const appliedThisWeek = decisions.filter((decision) => {
      if (decision.decision !== "auto_accept") {
        return false;
      }
      const ts = Date.parse(String(decision.ts ?? ""));
      return Number.isFinite(ts) && Date.now() - ts <= 7 * 24 * 60 * 60 * 1000;
    }).length;

    let decision = "auto_defer";
    let rationale = "confidence or reversibility threshold not met";

    const beforeSalary = typeof proposal.before?.salary_floor === "number" ? proposal.before.salary_floor : null;
    const afterSalary = typeof proposal.after?.salary_floor === "number" ? proposal.after.salary_floor : null;

    if (JSON.stringify(proposal.after ?? {}).includes("constraints") || JSON.stringify(proposal.after ?? {}).includes("preferences")) {
      decision = "escalate_to_human";
      rationale = "constraints/preferences changes require human approval";
    } else if (beforeSalary != null && afterSalary != null && afterSalary < beforeSalary) {
      decision = "escalate_to_human";
      rationale = "salary floor decrease requires human approval";
    } else if (proposal.reversibility === "hard") {
      decision = "auto_defer";
      rationale = "hard-to-reverse changes are deferred";
    } else if ((activeStrategy.tactics?.max_changes_per_week ?? Number.POSITIVE_INFINITY) <= appliedThisWeek) {
      decision = "auto_defer";
      rationale = "weekly strategy change budget exhausted";
    } else if ((proposal.confidence ?? 0) >= 0.65) {
      decision = "auto_accept";
      rationale = "proposal is reversible enough and exceeds confidence threshold";
    }

    return {
      tool: "auto_decide_strategy",
      result: {
        proposal_id: proposal.id,
        decision,
        rationale
      }
    };
  }

  async applyStrategyChange(args: {
    decision: string;
    proposal?: JsonRecord;
    proposal_id?: string;
  }): Promise<ToolResult> {
    const proposal = args.proposal ?? await safeParseJsonish(
      await this.resolveProposalPath(String(args.proposal_id)),
      null
    );

    if (!proposal) {
      throw new Error("Strategy proposal is required.");
    }

    await this.appendAudit({ ts: new Date().toISOString(), tool: "apply_strategy_change", args });

    const activeStrategyPath = path.join(this.dataRoot, "memory", "strategy", "active-strategy.yaml");
    const nextVersion = typeof proposal.applied_version === "string"
      ? proposal.applied_version
      : `v${Date.now()}`;
    const activeStrategy = await safeParseJsonish(activeStrategyPath, {});
    const updatedStrategy = {
      ...activeStrategy,
      ...proposal.after,
      version: nextVersion
    };

    const strategySchema = await loadSchema("strategy.schema.json");
    assertValidAgainstSchema(strategySchema, updatedStrategy, "active strategy");
    await writeJsonishFile(activeStrategyPath, updatedStrategy);

    const decisionLogPath = path.join(this.dataRoot, "memory", "strategy", "decision-log.jsonl");
    await appendJsonLineFile(decisionLogPath, {
      id: `decision-${proposal.id}`,
      ts: new Date().toISOString(),
      proposal_id: proposal.id,
      decision: args.decision,
      applied_version: nextVersion
    });

    await this.replayProjection();
    return {
      tool: "apply_strategy_change",
      result: { version: nextVersion, proposal_id: proposal.id }
    };
  }

  async updatePerformance(): Promise<ToolResult> {
    await this.appendAudit({ ts: new Date().toISOString(), tool: "update_performance", args: {} });
    const events = await readJsonLinesIfExists(path.join(this.dataRoot, "memory", "events", "application-events.jsonl"));
    const applied = events.filter((event) => event.kind === "applied").length;
    const responses = events.filter((event) => ["screened", "invited", "technical", "final", "offer"].includes(event.kind)).length;

    const channels = new Map<string, number>();
    for (const event of events) {
      const channel = event.payload?.channel;
      if (typeof channel === "string") {
        channels.set(channel, (channels.get(channel) ?? 0) + 1);
      }
    }

    const topChannel = [...channels.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    const summary = {
      window: `week-of-${new Date().toISOString().slice(0, 10)}`,
      response_rate: applied === 0 ? 0 : responses / applied,
      top_channel: topChannel,
      counts: Object.fromEntries(channels.entries())
    };

    const summaryPath = path.join(this.dataRoot, "memory", "performance", "weekly-summary.yaml");
    await writeJsonishFile(summaryPath, summary);
    await this.replayProjection();

    return {
      tool: "update_performance",
      result: summary
    };
  }

  async ingestSession(args: {
    session_id: string;
    transcript: string;
    role?: string | null;
    ts?: string | null;
  }): Promise<ToolResult> {
    await this.appendAudit({ ts: new Date().toISOString(), tool: "ingest_session", args });
    const ts = args.ts ?? new Date().toISOString();
    const filePath = path.join(this.dataRoot, "inbox", "session-transcripts", `${args.session_id}.md`);
    await ensureDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, [
      `# Session ${args.session_id}`,
      "",
      `- role: ${args.role ?? "unknown"}`,
      `- ts: ${ts}`,
      "",
      args.transcript
    ].join("\n"), "utf8");

    return {
      tool: "ingest_session",
      result: {
        session_id: args.session_id,
        path: filePath
      }
    };
  }

  async callTool(name: string, args: JsonRecord = {}): Promise<ToolResult> {
    switch (name) {
      case "list_vacancies":
        return this.listVacancies(args as { limit?: number; status?: string | null });
      case "get_vacancy":
        return this.getVacancy(args as { id: string });
      case "get_application_pack":
        return this.getApplicationPack(args as { id: string });
      case "list_applications":
        return this.listApplications(args as { channel?: string | null; limit?: number; status?: string | null; vacancy_id?: string | null });
      case "get_funnel":
        return this.getFunnel();
      case "search_performance":
        return this.searchPerformance();
      case "list_schedules":
        return this.listSchedules(args as { dueOnly?: boolean });
      case "next_actions":
        return this.nextActions(args as { horizon?: "today" | "week" });
      case "get_operator_status":
        return this.getOperatorStatus();
      case "bootstrap_operator":
        return this.bootstrapOperator();
      case "write_onboarding_profile":
        return this.writeOnboardingProfile(args as {
          profile: JsonRecord;
          resume_text?: string | null;
          resume_json?: JsonRecord | null;
          active_strategy?: JsonRecord | null;
          answers_markdown?: string | null;
          source_note?: string | null;
        });
      case "write_session_log":
        return this.writeSessionLog(args as {
          session_id: string;
          summary_markdown: string;
          tool_calls?: JsonRecord[] | null;
          changed_paths?: string[] | null;
          blockers?: string[] | null;
          next_actions?: string[] | null;
          ts?: string | null;
        });
      case "write_journal_entry":
        return this.writeJournalEntry(args as {
          entry_id: string;
          summary_markdown: string;
          period?: string | null;
          role?: string | null;
          evidence_refs?: string[] | null;
          changed_paths?: string[] | null;
          ts?: string | null;
        });
      case "create_vacancy":
        return this.createVacancy(args as { vacancy: JsonRecord; markdown?: string | null });
      case "create_application":
        return this.createApplication(args as { application: JsonRecord; cover_letter?: JsonRecord | null });
      case "create_application_package":
        return this.createApplicationPackage(args as {
          application: JsonRecord;
          cover_letter?: JsonRecord | null;
          letter_markdown?: string | null;
          screening_answers_markdown?: string | null;
          resume_variant_ref?: JsonRecord | null;
          reviewer_verdict?: JsonRecord | null;
          outbox?: JsonRecord | null;
        });
      case "write_application_asset":
        return this.writeApplicationAsset(args as {
          application_id: string;
          kind: "letter_markdown" | "screening_answers_markdown" | "resume_variant_ref" | "reviewer_verdict" | "outbox";
          content?: string | null;
          payload?: JsonRecord | null;
        });
      case "update_application_status":
        return this.updateApplicationStatus(args as {
          id: string;
          status: string;
          reason?: string | null;
          evidence_ref?: string | null;
          human_confirmation?: boolean | null;
        });
      case "log_event":
        return this.logEvent(args as {
          event: JsonRecord;
          evidence_text?: string | null;
          evidence_name?: string | null;
          human_confirmation?: boolean | null;
        });
      case "propose_strategy_change":
        return this.proposeStrategyChange(args as { proposal: JsonRecord });
      case "auto_decide_strategy":
        return this.autoDecideStrategy(args as { proposal?: JsonRecord; proposal_id?: string });
      case "apply_strategy_change":
        return this.applyStrategyChange(args as { decision: string; proposal?: JsonRecord; proposal_id?: string });
      case "update_performance":
        return this.updatePerformance();
      case "ingest_session":
        return this.ingestSession(args as { session_id: string; transcript: string; role?: string | null; ts?: string | null });
      default:
        throw new Error(`Unknown tool "${name}"`);
    }
  }
}

export function getToolDefinitions(): Array<{ name: string; description: string; inputSchema: JsonRecord }> {
  return [
    {
      name: "list_vacancies",
      description: "List projected vacancies from the runtime data root.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          status: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_vacancy",
      description: "Load one vacancy JSON snapshot by id.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
        additionalProperties: false
      }
    },
    {
      name: "get_application_pack",
      description: "Load application, vacancy, cover letter, interview, and events for one application id.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
        additionalProperties: false
      }
    },
    {
      name: "list_applications",
      description: "List projected applications from the runtime data root.",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: ["string", "null"] },
          limit: { type: "number" },
          status: { type: ["string", "null"] },
          vacancy_id: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_funnel",
      description: "Return aggregated application funnel counts and response rate.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "search_performance",
      description: "Read the latest performance summary plus derived event counts.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "list_schedules",
      description: "List runtime schedules from the projection DB.",
      inputSchema: {
        type: "object",
        properties: {
          dueOnly: { type: "boolean" }
        },
        additionalProperties: false
      }
    },
    {
      name: "next_actions",
      description: "Return the next few application or schedule actions.",
      inputSchema: {
        type: "object",
        properties: {
          horizon: { type: "string", enum: ["today", "week"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_operator_status",
      description: "Check installed operator readiness for Codex-first work.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "bootstrap_operator",
      description: "Create missing external roots/defaults and refresh the local projection for an operator session.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "write_onboarding_profile",
      description: "Persist resume/onboarding answers into runtime memory and refresh readiness.",
      inputSchema: {
        type: "object",
        required: ["profile"],
        properties: {
          profile: { type: "object" },
          resume_text: { type: ["string", "null"] },
          resume_json: { type: ["object", "null"] },
          active_strategy: { type: ["object", "null"] },
          answers_markdown: { type: ["string", "null"] },
          source_note: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "write_session_log",
      description: "Write a human-readable operator session log with tool calls, changed paths, blockers, and next actions.",
      inputSchema: {
        type: "object",
        required: ["session_id", "summary_markdown"],
        properties: {
          session_id: { type: "string" },
          summary_markdown: { type: "string" },
          tool_calls: { type: ["array", "null"], items: { type: "object" } },
          changed_paths: { type: ["array", "null"], items: { type: "string" } },
          blockers: { type: ["array", "null"], items: { type: "string" } },
          next_actions: { type: ["array", "null"], items: { type: "string" } },
          ts: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "write_journal_entry",
      description: "Write one narrative journal entry through the runtime memory API.",
      inputSchema: {
        type: "object",
        required: ["entry_id", "summary_markdown"],
        properties: {
          entry_id: { type: "string" },
          summary_markdown: { type: "string" },
          period: { type: ["string", "null"] },
          role: { type: ["string", "null"] },
          evidence_refs: { type: ["array", "null"], items: { type: "string" } },
          changed_paths: { type: ["array", "null"], items: { type: "string" } },
          ts: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "create_vacancy",
      description: "Write a vacancy snapshot and refresh the projection.",
      inputSchema: {
        type: "object",
        required: ["vacancy"],
        properties: {
          vacancy: { type: "object" },
          markdown: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "create_application",
      description: "Write an application snapshot and optional cover letter, then refresh the projection.",
      inputSchema: {
        type: "object",
        required: ["application"],
        properties: {
          application: { type: "object" },
          cover_letter: { type: ["object", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "create_application_package",
      description: "Write a supervised application package with draft assets, then refresh the projection.",
      inputSchema: {
        type: "object",
        required: ["application"],
        properties: {
          application: { type: "object" },
          cover_letter: { type: ["object", "null"] },
          letter_markdown: { type: ["string", "null"] },
          screening_answers_markdown: { type: ["string", "null"] },
          resume_variant_ref: { type: ["object", "null"] },
          reviewer_verdict: { type: ["object", "null"] },
          outbox: { type: ["object", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "write_application_asset",
      description: "Write one draft/review/outbox asset for an existing application.",
      inputSchema: {
        type: "object",
        required: ["application_id", "kind"],
        properties: {
          application_id: { type: "string" },
          kind: {
            type: "string",
            enum: ["letter_markdown", "screening_answers_markdown", "resume_variant_ref", "reviewer_verdict", "outbox"]
          },
          content: { type: ["string", "null"] },
          payload: { type: ["object", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "update_application_status",
      description: "Update one application status through the supervised state machine.",
      inputSchema: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          reason: { type: ["string", "null"] },
          evidence_ref: { type: ["string", "null"] },
          human_confirmation: { type: ["boolean", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "log_event",
      description: "Append one application event and optional evidence, then refresh the projection.",
      inputSchema: {
        type: "object",
        required: ["event"],
        properties: {
          event: { type: "object" },
          evidence_text: { type: ["string", "null"] },
          evidence_name: { type: ["string", "null"] },
          human_confirmation: { type: ["boolean", "null"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "propose_strategy_change",
      description: "Write one strategy change proposal.",
      inputSchema: {
        type: "object",
        required: ["proposal"],
        properties: {
          proposal: { type: "object" }
        },
        additionalProperties: false
      }
    },
    {
      name: "auto_decide_strategy",
      description: "Run the deterministic decision gate for one proposal.",
      inputSchema: {
        type: "object",
        properties: {
          proposal: { type: "object" },
          proposal_id: { type: "string" }
        },
        additionalProperties: false
      }
    },
    {
      name: "apply_strategy_change",
      description: "Apply an accepted strategy change and append the decision log.",
      inputSchema: {
        type: "object",
        required: ["decision"],
        properties: {
          decision: { type: "string" },
          proposal: { type: "object" },
          proposal_id: { type: "string" }
        },
        additionalProperties: false
      }
    },
    {
      name: "update_performance",
      description: "Rebuild deterministic performance summaries from the event log.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "ingest_session",
      description: "Write one session transcript into the runtime inbox for later memory processing.",
      inputSchema: {
        type: "object",
        required: ["session_id", "transcript"],
        properties: {
          session_id: { type: "string" },
          transcript: { type: "string" },
          role: { type: ["string", "null"] },
          ts: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    }
  ];
}
