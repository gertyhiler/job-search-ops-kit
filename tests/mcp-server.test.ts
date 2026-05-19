import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JobSearchService, getToolDefinitions } from "../packages/mcp-server/service.ts";
import { dumpTables } from "../packages/db/index.ts";

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

async function withExampleRoots(fn: (roots: { dataRoot: string; stateRoot: string }) => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-mcp-"));
  try {
    const dataRoot = path.join(tempRoot, "data");
    const stateRoot = path.join(tempRoot, "state");
    await copyDirectory(path.join(process.cwd(), "examples", "user-data-example"), dataRoot);
    await fn({ dataRoot, stateRoot });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("JobSearchService exposes projected read tools from fixture roots", async () => {
  await withExampleRoots(async ({ dataRoot, stateRoot }) => {
    const service = new JobSearchService({ dataRoot, stateRoot });

    const vacancies = await service.listVacancies({ limit: 10 });
    const funnel = await service.getFunnel();
    const applicationPack = await service.getApplicationPack({ id: "app-acme-platform-engineer" });

    assert.equal((vacancies.result as any[]).length, 1);
    assert.equal((funnel.result as any).total_applications, 1);
    assert.equal((applicationPack.result as any).vacancy.id, "vac-acme-platform-engineer");
  });
});

test("JobSearchService writes vacancy, event evidence, and refreshed projection deterministically", async () => {
  await withExampleRoots(async ({ dataRoot, stateRoot }) => {
    const service = new JobSearchService({ dataRoot, stateRoot });

    await service.createVacancy({
      vacancy: {
        id: "vac-example-runtime-role",
        source: "hh",
        source_id: "hh-123",
        url: "https://example.com/jobs/123",
        company: "Example Inc",
        title: "Platform Engineer",
        location: "Remote",
        remote: "remote",
        salary_min: 8000,
        salary_max: 10000,
        currency: "USD",
        tags: ["platform", "go"],
        jd_markdown_path: null,
        match_score: 81,
        match_rationale: "Strong platform overlap.",
        status: "candidate",
        first_seen_at: "2026-04-23T07:00:00Z"
      },
      markdown: "# Example vacancy\n"
    });

    await service.logEvent({
      event: {
        id: "event-example-rejected",
        application_id: "app-acme-platform-engineer",
        ts: "2026-04-23T12:00:00Z",
        kind: "rejected",
        payload: { source: "email" },
        evidence_ref: null,
        emitted_by: "memory-manager"
      },
      evidence_text: "Unfortunately we will not move forward.",
      evidence_name: "example-rejection.txt"
    });

    const tables = await dumpTables(path.join(stateRoot, "job-search.db"));
    assert.equal(tables.vacancy.length, 2);
    assert.equal(tables.application_event.length, 3);
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "vacancies", "vac-example-runtime-role.md")));
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "evidence", "example-rejection.txt")));
  });
});

test("application workflow tools write package assets and gate applied status", async () => {
  await withExampleRoots(async ({ dataRoot, stateRoot }) => {
    const service = new JobSearchService({ dataRoot, stateRoot });

    await service.createVacancy({
      vacancy: {
        id: "vac-supervised-loop",
        source: "site",
        source_id: "site-456",
        url: "https://example.com/jobs/supervised-loop",
        company: "Loop Systems",
        title: "Backend Platform Engineer",
        location: "Remote",
        remote: "remote",
        salary_min: 9000,
        salary_max: 12000,
        currency: "USD",
        tags: ["backend", "platform"],
        jd_markdown_path: null,
        match_score: 88,
        match_rationale: "Strong backend and platform overlap.",
        status: "candidate",
        first_seen_at: "2026-04-24T07:00:00Z"
      },
      markdown: "# Supervised loop vacancy\n"
    });

    await service.createApplicationPackage({
      application: {
        id: "app-supervised-loop",
        vacancy_id: "vac-supervised-loop",
        resume_version_id: "resume-supervised-loop",
        cover_letter_id: "cover-letter-app-supervised-loop",
        channel: "site",
        status: "dry_run",
        applied_at: null,
        confidence: 0.87,
        auto_sent: false,
        dry_run: true
      },
      cover_letter: {
        id: "cover-letter-app-supervised-loop",
        application_id: "app-supervised-loop",
        style: "concise",
        tone: "evidence-led",
        markdown: "Hello Loop Systems.",
        sha: "sha-supervised-loop",
        generated_by_model: "gpt-5.4-mini"
      },
      letter_markdown: "Hello Loop Systems.",
      screening_answers_markdown: "Q: Why this role?\nA: Platform fit.",
      resume_variant_ref: { id: "resume-supervised-loop", rendered_pdf_path: "memory/resumes/variants/supervised-loop.pdf" }
    });

    const listed = await service.listApplications({ status: "dry_run", vacancy_id: "vac-supervised-loop" });
    assert.equal((listed.result as any[]).length, 1);

    await service.writeApplicationAsset({
      application_id: "app-supervised-loop",
      kind: "reviewer_verdict",
      payload: { verdict: "approve", reviewer: "reviewer", ts: "2026-04-24T08:00:00Z" }
    });
    await service.updateApplicationStatus({
      id: "app-supervised-loop",
      status: "ready_to_send",
      reason: "reviewer approved"
    });
    await service.writeApplicationAsset({
      application_id: "app-supervised-loop",
      kind: "outbox",
      payload: { mode: "manual", instructions: "Submit via company form." }
    });
    await service.updateApplicationStatus({
      id: "app-supervised-loop",
      status: "outbox_prepared",
      reason: "manual outbox ready"
    });

    await assert.rejects(
      () => service.updateApplicationStatus({
        id: "app-supervised-loop",
        status: "applied"
      }),
      /evidence_ref and human_confirmation/
    );
    await assert.rejects(
      () => service.logEvent({
        event: {
          id: "event-supervised-loop-applied-invalid",
          application_id: "app-supervised-loop",
          ts: "2026-04-24T09:00:00Z",
          kind: "applied",
          payload: { channel: "site" },
          evidence_ref: null,
          emitted_by: "control-plane"
        }
      }),
      /human_confirmation/
    );

    const appliedEvent = await service.logEvent({
      event: {
        id: "event-supervised-loop-applied",
        application_id: "app-supervised-loop",
        ts: "2026-04-24T09:15:00Z",
        kind: "applied",
        payload: { channel: "site", manual_confirmation: true },
        evidence_ref: null,
        emitted_by: "control-plane"
      },
      evidence_text: "Application submitted manually.",
      evidence_name: "supervised-loop-applied.txt",
      human_confirmation: true
    });
    await service.updateApplicationStatus({
      id: "app-supervised-loop",
      status: "applied",
      evidence_ref: String((appliedEvent.result as any).evidence_ref),
      human_confirmation: true
    });

    const pack = await service.getApplicationPack({ id: "app-supervised-loop" });
    assert.equal((pack.result as any).reviewer_verdict.verdict, "approve");
    assert.equal((pack.result as any).outbox.mode, "manual");
    assert.match((pack.result as any).letter_markdown, /Loop Systems/);

    const tables = await dumpTables(path.join(stateRoot, "job-search.db"));
    const row = tables.application.find((application: any) => application.id === "app-supervised-loop");
    assert.equal(row.status, "applied");
    assert.equal(row.applied_at, "2026-04-24T09:15:00Z");
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "applications", "app-supervised-loop", "outbox.json")));
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "evidence", "supervised-loop-applied.txt")));
  });
});

test("operator onboarding tools bootstrap roots, write profile, and leave a session log", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-onboarding-"));
  try {
    const dataRoot = path.join(tempRoot, "data");
    const stateRoot = path.join(tempRoot, "state");
    const service = new JobSearchService({ dataRoot, stateRoot });

    const bootstrapped = await service.bootstrapOperator();
    assert.equal((bootstrapped.result as any).status.onboarding.ready, false);

    const onboarding = await service.writeOnboardingProfile({
      profile: {
        candidate: {
          name: "Alex Dev",
          headline: "Senior Platform Engineer",
          years_experience: 9,
          seniority: "senior",
          summary_markdown: "Platform engineer focused on developer tooling."
        },
        constraints: {
          location: ["Remote"],
          remote: "remote",
          languages: [{ code: "en", level: "C1" }]
        },
        preferences: {
          salary_target: 110000,
          currency: "EUR",
          preferred_industries: ["Developer Tools"],
          must_have_tech: ["TypeScript", "PostgreSQL"]
        }
      },
      resume_text: "# Alex Dev\n\nPlatform engineering resume.",
      answers_markdown: "- Target: senior platform roles.",
      source_note: "test"
    });

    assert.equal((onboarding.result as any).status.onboarding.ready, true);

    const sessionLog = await service.writeSessionLog({
      session_id: "test-onboarding",
      summary_markdown: "Captured initial profile and resume.",
      tool_calls: [{ name: "write_onboarding_profile", status: "ok" }],
      changed_paths: (onboarding.result as any).changed_paths,
      next_actions: ["Run scout for senior platform roles."],
      ts: "2026-05-12T09:00:00Z"
    });

    assert.ok(await fs.stat(path.join(dataRoot, "memory", "profile", "profile.snapshot.json")));
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "profile", "master-resume.md")));
    assert.ok(await fs.stat(path.join(dataRoot, "memory", "onboarding", "answers.md")));
    assert.ok(await fs.stat((sessionLog.result as any).path));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("journal entries are written through the MCP service and audited", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-journal-"));
  try {
    const dataRoot = path.join(tempRoot, "data");
    const stateRoot = path.join(tempRoot, "state");
    const service = new JobSearchService({ dataRoot, stateRoot });

    assert.ok(getToolDefinitions().some((tool) => tool.name === "write_journal_entry"));

    const journal = await service.callTool("write_journal_entry", {
      entry_id: "memory-pass",
      summary_markdown: "Classified inbox signals and updated the performance summary.",
      period: "2026-05-12",
      role: "memory-manager",
      evidence_refs: ["memory/events/application-events.jsonl"],
      changed_paths: ["memory/performance/weekly-summary.yaml"],
      ts: "2026-05-12T10:00:00Z"
    });

    const journalPath = (journal.result as any).path;
    const journalText = await fs.readFile(journalPath, "utf8");
    const auditText = await fs.readFile(path.join(stateRoot, "audit", "mcp-tool-calls.jsonl"), "utf8");

    assert.equal(journalPath, path.join(dataRoot, "memory", "journal", "2026", "2026-05-12-memory-pass.md"));
    assert.match(journalText, /Classified inbox signals/);
    assert.match(auditText, /"tool":"write_journal_entry"/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("strategy proposal tools auto-decide and apply a reversible change", async () => {
  await withExampleRoots(async ({ dataRoot, stateRoot }) => {
    const service = new JobSearchService({ dataRoot, stateRoot });

    await service.proposeStrategyChange({
      proposal: {
        id: "proposal-002",
        ts: "2026-04-23T08:00:00Z",
        before: { match_threshold: 72 },
        after: { tactics: { match_threshold: 78 } },
        rationale: "Tighten the funnel to reduce low-fit reviews.",
        evidence_refs: ["memory/performance/weekly-summary.yaml"],
        expected_impact: "Higher signal in the shortlist.",
        confidence: 0.82,
        reversibility: "trivial",
        proposed_by: "strategist"
      }
    });

    const decision = await service.autoDecideStrategy({ proposal_id: "proposal-002" });
    assert.equal((decision.result as any).decision, "auto_accept");

    const applied = await service.applyStrategyChange({
      proposal_id: "proposal-002",
      decision: "auto_accept"
    });

    const activeStrategy = JSON.parse(await fs.readFile(path.join(dataRoot, "memory", "strategy", "active-strategy.yaml"), "utf8"));
    const decisionLog = await fs.readFile(path.join(dataRoot, "memory", "strategy", "decision-log.jsonl"), "utf8");

    assert.equal(activeStrategy.tactics.match_threshold, 78);
    assert.equal((applied.result as any).proposal_id, "proposal-002");
    assert.ok(decisionLog.includes("\"proposal_id\":\"proposal-002\""));
  });
});
