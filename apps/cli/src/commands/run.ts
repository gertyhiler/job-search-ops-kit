import path from "node:path";
import { resumeSchema, type Resume } from "@job-search/contracts";
import {
  loadEnv,
  loadResumeTheme,
  readJsonFileOr,
  resolvePaths,
} from "@job-search/core";
import {
  getFunnel,
  getVacancyById,
  listApplications,
  listQueue,
  listVacancies,
  openAndMigrate,
} from "@job-search/db";
import { loginBootstrap } from "@job-search/browser";
import { runConsolidation } from "@job-search/memory";
import { renderResume } from "@job-search/resume";
import {
  buildSummaryText,
  createApp,
  createContext,
  runApply,
  runNotify,
  runPackage,
  runScore,
  runSearch,
} from "@job-search/service";
import { callToolOnce, listToolNames, startMcpServer } from "@job-search/mcp";
import type { ParsedArgs } from "../args.ts";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function envPaths(): {
  env: ReturnType<typeof loadEnv>;
  paths: ReturnType<typeof resolvePaths>;
} {
  const env = loadEnv();
  return {
    env,
    paths: resolvePaths({ dataDir: env.DATA_DIR, dbPath: env.DATABASE_PATH }),
  };
}

export async function hhLogin(): Promise<void> {
  const { paths } = envPaths();
  const result = await loginBootstrap({
    storageStatePath: paths.storageStatePath,
    onStatus: (m) => console.log(m),
  });
  console.log(result.message);
}

export async function search(): Promise<void> {
  const ctx = createContext();
  printJson(await runSearch(ctx));
  ctx.db.close();
}

export async function score(): Promise<void> {
  const ctx = createContext();
  printJson(await runScore(ctx));
  ctx.db.close();
}

export async function sync(): Promise<void> {
  const ctx = createContext();
  const s = await runSearch(ctx);
  const sc = await runScore(ctx);
  printJson({ search: s, score: sc });
  ctx.db.close();
}

export async function letters(): Promise<void> {
  const ctx = createContext();
  printJson(await runPackage(ctx));
  ctx.db.close();
}

export async function apply(args: ParsedArgs): Promise<void> {
  if (args.flags.real) process.env.AUTO_APPLY_MODE = "real";
  if (args.flags["dry-run"]) process.env.AUTO_APPLY_MODE = "dry_run";
  const ctx = createContext();
  console.log(`apply mode: ${ctx.env.AUTO_APPLY_MODE}`);
  printJson(await runApply(ctx));
  ctx.db.close();
}

export async function notify(): Promise<void> {
  const ctx = createContext();
  printJson(await runNotify(ctx));
  ctx.db.close();
}

export function queueReview(args: ParsedArgs): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  const type = (args.flags.type as string | undefined) ?? undefined;
  printJson(listQueue(db, type as never, "open", 100));
  db.close();
}

export function resumeRender(args: ParsedArgs): void {
  const { env, paths: p } = envPaths();
  const variant = (args.flags.variant as string | undefined) ?? "master";
  const file =
    variant === "master"
      ? path.join(p.resumeDir, "master-resume.json")
      : path.join(p.resumeVariantsDir, `${variant}.json`);
  const data = readJsonFileOr<Resume | null>(file, null);
  if (!data) {
    console.error(`Resume file not found: ${file}`);
    process.exitCode = 1;
    return;
  }
  const resume = resumeSchema.parse(data);
  const out = path.join(p.resumeRendersDir, `resume-${variant}.pdf`);
  const result = renderResume({
    resume,
    theme: loadResumeTheme(),
    outPdfPath: out,
    typstBin: env.TYPST_BIN,
  });
  console.log(result.message);
  if (result.ok) console.log(`PDF: ${result.pdfPath}`);
  else process.exitCode = 1;
}

export async function consolidate(): Promise<void> {
  const ctx = createContext();
  printJson(await runConsolidation(ctx.db, ctx.env, ctx.logger));
  ctx.db.close();
}

export function report(args: ParsedArgs): void {
  const ctx = createContext();
  const weekly = Boolean(args.flags.weekly);
  const since = new Date(
    weekly
      ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : new Date().setUTCHours(0, 0, 0, 0),
  );
  console.log(
    buildSummaryText(
      ctx,
      since.toISOString(),
      weekly ? "Weekly report" : "Daily report",
    ),
  );
  ctx.db.close();
}

export function dbMigrate(): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  db.close();
  console.log(`Migrated ${paths.dbPath}`);
}

export async function mcp(args: ParsedArgs): Promise<void> {
  const sub = args.positionals[0];
  if (sub === "serve") {
    await startMcpServer();
    return; // long-lived
  }
  if (sub === "call") {
    const tool = args.positionals[1];
    if (!tool) {
      console.error(
        `Usage: job-search mcp call <tool> --args '<json>'\nTools: ${listToolNames().join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }
    const argsJson = (args.flags.args as string | undefined) ?? "{}";
    const parsed = JSON.parse(argsJson) as Record<string, unknown>;
    printJson(await callToolOnce(tool, parsed));
    return;
  }
  console.error(`Usage: job-search mcp <serve|call>`);
  process.exitCode = 1;
}

export async function start(): Promise<void> {
  const app = createApp();
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    app.context.logger.info({ signal }, "Shutting down");
    await app.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  await app.start();
}

export function vacanciesList(args: ParsedArgs): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  const rows = listVacancies(db, {
    status: args.flags.status as string | undefined,
    applyMode: args.flags.mode as string | undefined,
    limit: args.flags.limit ? Number(args.flags.limit) : 50,
  });
  for (const r of rows) {
    console.log(
      `#${r.id} [${r.pipeline_status}/${r.apply_mode ?? "-"}] fit=${r.fit_score ?? "-"} pri=${r.priority_score ?? "-"} ${r.title}`,
    );
  }
  console.log(`\n${rows.length} vacancies`);
  db.close();
}

export function vacancyShow(args: ParsedArgs): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  const id = Number(args.positionals[0]);
  printJson(getVacancyById(db, id) ?? null);
  db.close();
}

export function applicationsList(): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  printJson(listApplications(db, 100));
  db.close();
}

export function funnel(): void {
  const { paths } = envPaths();
  const db = openAndMigrate(paths.dbPath);
  printJson(getFunnel(db));
  db.close();
}
