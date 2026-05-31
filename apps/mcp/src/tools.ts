import path from "node:path";
import { z } from "zod";
import { resumeSchema, type Resume } from "@job-search/contracts";
import {
  loadResumeTheme,
  readJsonFileOr,
  readTextFileOr,
  STRATEGY_FILES,
  writeTextFile,
} from "@job-search/core";
import {
  addApplicationArtifact,
  getApplicationByVacancy,
  getFunnel,
  getVacancyById,
  listApplications,
  listInsights,
  listQueue,
  listVacancies,
} from "@job-search/db";
import { recordEvent, runConsolidation } from "@job-search/memory";
import { renderResume } from "@job-search/resume";
import { runScore, runSearch, type PipelineContext } from "@job-search/service";
import { enqueue as enqueueRow } from "@job-search/db";

export interface ToolDef {
  name: string;
  description: string;
  inputShape: Record<string, z.ZodTypeAny>;
  handler: (
    args: Record<string, unknown>,
    ctx: PipelineContext,
  ) => Promise<unknown> | unknown;
}

const PROFILE_FILES = new Set([
  "user-profile",
  "career-goals",
  "constraints",
  "compensation",
  "experience-facts",
  "evidence",
  "resume-gaps",
  "prompt-additions",
]);
const STRATEGY_FILE_SET = new Set<string>(STRATEGY_FILES);
const PROMPT_FILES = new Set(["vacancy-scoring"]);

function vacancySummary(row: ReturnType<typeof getVacancyById>): unknown {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    company: row.company_id,
    url: row.url,
    status: row.pipeline_status,
    applyMode: row.apply_mode,
    fit: row.fit_score,
    priority: row.priority_score,
    risk: row.risk_score,
  };
}

export function buildTools(): ToolDef[] {
  return [
    // ---------------- read ----------------
    {
      name: "list_vacancies",
      description: "List vacancies, optionally filtered by status/applyMode.",
      inputShape: {
        status: z.string().optional(),
        applyMode: z.string().optional(),
        limit: z.number().optional(),
      },
      handler: (args, ctx) =>
        listVacancies(ctx.db, {
          status: args.status as string | undefined,
          applyMode: args.applyMode as string | undefined,
          limit: (args.limit as number | undefined) ?? 50,
        }).map(vacancySummary),
    },
    {
      name: "get_vacancy",
      description: "Get a single vacancy by id (full row).",
      inputShape: { id: z.number() },
      handler: (args, ctx) => getVacancyById(ctx.db, args.id as number) ?? null,
    },
    {
      name: "list_applications",
      description: "List recent applications.",
      inputShape: { limit: z.number().optional() },
      handler: (args, ctx) =>
        listApplications(ctx.db, (args.limit as number | undefined) ?? 50),
    },
    {
      name: "get_funnel",
      description:
        "Counts of vacancies by status, applications by status, open queues by type.",
      inputShape: {},
      handler: (_args, ctx) => getFunnel(ctx.db),
    },
    {
      name: "list_queues",
      description: "List open queue items, optionally by type.",
      inputShape: { type: z.string().optional() },
      handler: (args, ctx) =>
        listQueue(ctx.db, args.type as never, "open", 100),
    },
    {
      name: "next_actions",
      description:
        "What needs a human now: open exception queues + high-value vacancies awaiting a decision.",
      inputShape: {},
      handler: (_args, ctx) => {
        const queues = listQueue(ctx.db, undefined, "open", 100);
        const highValue = listVacancies(ctx.db, {
          status: "packaged",
          applyMode: "high_value",
          limit: 50,
        }).map(vacancySummary);
        return { openQueues: queues, highValueAwaitingDecision: highValue };
      },
    },
    {
      name: "read_profile",
      description: "Read the candidate profile/strategy markdown files.",
      inputShape: {},
      handler: (_args, ctx) => {
        const out: Record<string, string> = {};
        for (const f of PROFILE_FILES) {
          out[f] = readTextFileOr(
            path.join(ctx.paths.profileDir, `${f}.md`),
            "",
          );
        }
        return out;
      },
    },
    {
      name: "get_insights",
      description: "Read consolidation insights (memory).",
      inputShape: { limit: z.number().optional() },
      handler: (args, ctx) =>
        listInsights(ctx.db, (args.limit as number | undefined) ?? 50),
    },

    // ---------------- write (programmatic, validated) ----------------
    {
      name: "write_profile",
      description:
        "Overwrite a profile markdown file. Allowed: user-profile, career-goals, constraints, compensation, experience-facts, evidence, resume-gaps, prompt-additions.",
      inputShape: { file: z.string(), content: z.string() },
      handler: (args, ctx) => {
        const file = args.file as string;
        if (!PROFILE_FILES.has(file))
          throw new Error(`Disallowed profile file: ${file}`);
        const dest = path.join(ctx.paths.profileDir, `${file}.md`);
        writeTextFile(dest, args.content as string);
        recordEvent(ctx.db, {
          type: "profile_written",
          entityType: "profile",
          payload: { file },
        });
        return { ok: true, file: dest };
      },
    },
    {
      name: "write_strategy",
      description:
        "Overwrite a strategy YAML file. Allowed: search-strategy, auto-apply-policy, vacancy-scoring.",
      inputShape: { file: z.string(), content: z.string() },
      handler: (args, ctx) => {
        const file = args.file as string;
        if (!STRATEGY_FILE_SET.has(file))
          throw new Error(`Disallowed strategy file: ${file}`);
        const dest = path.join(ctx.paths.strategyDir, `${file}.yaml`);
        writeTextFile(dest, args.content as string);
        recordEvent(ctx.db, {
          type: "strategy_written",
          entityType: "strategy",
          payload: { file },
        });
        return { ok: true, file: dest };
      },
    },
    {
      name: "write_prompt",
      description:
        "Overwrite a data/prompts markdown file. Allowed: vacancy-scoring.",
      inputShape: { file: z.string(), content: z.string() },
      handler: (args, ctx) => {
        const file = args.file as string;
        if (!PROMPT_FILES.has(file))
          throw new Error(`Disallowed prompt file: ${file}`);
        const dest = path.join(ctx.paths.dataDir, "prompts", `${file}.md`);
        writeTextFile(dest, args.content as string);
        recordEvent(ctx.db, {
          type: "prompt_written",
          entityType: "strategy",
          payload: { file },
        });
        return { ok: true, file: dest };
      },
    },
    {
      name: "append_evidence",
      description: "Append an evidence bullet to data/profile/evidence.md.",
      inputShape: { content: z.string() },
      handler: (args, ctx) => {
        const dest = path.join(ctx.paths.profileDir, "evidence.md");
        const existing = readTextFileOr(dest, "# Evidence\n");
        writeTextFile(
          dest,
          `${existing.trimEnd()}\n- EVIDENCE: ${args.content as string}\n`,
        );
        recordEvent(ctx.db, {
          type: "evidence_appended",
          entityType: "profile",
        });
        return { ok: true };
      },
    },
    {
      name: "propose_resume_update",
      description:
        "Append a resume-gap suggestion to data/profile/resume-gaps.md.",
      inputShape: { suggestion: z.string() },
      handler: (args, ctx) => {
        const dest = path.join(ctx.paths.profileDir, "resume-gaps.md");
        const existing = readTextFileOr(dest, "# Resume gaps\n");
        writeTextFile(
          dest,
          `${existing.trimEnd()}\n- GAP: ${args.suggestion as string}\n`,
        );
        recordEvent(ctx.db, {
          type: "resume_gap_proposed",
          entityType: "profile",
        });
        return { ok: true };
      },
    },
    {
      name: "create_application_note",
      description: "Attach a note to a vacancy's application and log it.",
      inputShape: { vacancyId: z.number(), note: z.string() },
      handler: (args, ctx) => {
        const vacancyId = args.vacancyId as number;
        const app = getApplicationByVacancy(ctx.db, vacancyId);
        if (app) {
          addApplicationArtifact(ctx.db, {
            applicationId: app.id,
            type: "note",
            content: args.note as string,
          });
        }
        recordEvent(ctx.db, {
          type: "application_note",
          entityType: "vacancy",
          entityId: vacancyId,
          payload: { note: args.note },
        });
        return { ok: true, hadApplication: Boolean(app) };
      },
    },
    {
      name: "log_event",
      description: "Append a programmatic event to memory (DB + journal).",
      inputShape: {
        type: z.string(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        payload: z.record(z.unknown()).optional(),
      },
      handler: (args, ctx) =>
        recordEvent(ctx.db, {
          type: args.type as string,
          entityType: (args.entityType as string | undefined) ?? null,
          entityId: (args.entityId as number | undefined) ?? null,
          payload: args.payload,
        }),
    },
    {
      name: "enqueue",
      description:
        "Add an item to a queue (auto_apply, manual_review, questionnaire, ...).",
      inputShape: {
        type: z.string(),
        entityType: z.string(),
        entityId: z.number(),
        reason: z.string().optional(),
      },
      handler: (args, ctx) =>
        enqueueRow(ctx.db, {
          type: args.type as never,
          entityType: args.entityType as string,
          entityId: args.entityId as number,
          reason: args.reason as string | undefined,
        }),
    },

    // ---------------- actions ----------------
    {
      name: "run_search",
      description:
        "Run the search stage now (fetch + normalize + dedupe + store).",
      inputShape: {},
      handler: (_args, ctx) => runSearch(ctx),
    },
    {
      name: "score_vacancies",
      description: "Run the scoring + apply-mode classification stage now.",
      inputShape: {},
      handler: (_args, ctx) => runScore(ctx),
    },
    {
      name: "render_resume",
      description:
        "Render a resume PDF from master-resume.json (or a named variant) via Typst.",
      inputShape: { variant: z.string().optional() },
      handler: (args, ctx) => {
        const variant = (args.variant as string | undefined) ?? "master";
        const file =
          variant === "master"
            ? path.join(ctx.paths.resumeDir, "master-resume.json")
            : path.join(ctx.paths.resumeVariantsDir, `${variant}.json`);
        const data = readJsonFileOr<Resume | null>(file, null);
        if (!data) throw new Error(`Resume file not found: ${file}`);
        const resume = resumeSchema.parse(data);
        const outPdf = path.join(
          ctx.paths.resumeRendersDir,
          `resume-${variant}.pdf`,
        );
        return renderResume({
          resume,
          theme: loadResumeTheme(),
          outPdfPath: outPdf,
          typstBin: ctx.env.TYPST_BIN,
        });
      },
    },
    {
      name: "request_consolidation",
      description: "Run the deterministic memory consolidation now.",
      inputShape: {},
      handler: (_args, ctx) => runConsolidation(ctx.db, ctx.env, ctx.logger),
    },
  ];
}
