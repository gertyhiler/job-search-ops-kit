#!/usr/bin/env -S npx tsx
import { parseArgs } from "./src/args.ts";
import { runDoctor } from "./src/commands/doctor.ts";
import { runInit } from "./src/commands/init.ts";
import * as run from "./src/commands/run.ts";

const HELP = `job-search — local job-search automation

Setup
  init                     Scaffold the gitignored data/ tree + seed configs
  doctor                   Verify environment (env, sqlite, typst, playwright, telegram, ...)
  hh:login                 Open a browser to log into HH and save the session

Pipeline
  hh:search | search       Fetch + normalize + dedupe + store new vacancies
  score                    Score + classify apply-mode for new vacancies
  hh:sync | sync           search then score
  letters:generate         Generate cover letters / application packages
  apply [--dry-run|--real] Run the Playwright apply stage
  notify                   Send pending Telegram notifications
  start                    Run the full long-lived pipeline (cron queues)

Memory & resume
  consolidate              Run deterministic memory consolidation now
  report [--weekly]        Print a daily/weekly summary
  resume render [--variant <name>]   Render a resume PDF via Typst

Inspect
  vacancies list [--status s --mode m --limit n]
  vacancies show <id>
  applications list
  funnel
  queue:review [--type t]

Integration
  db migrate               Apply the SQLite schema
  mcp serve                Start the MCP server (stdio)
  mcp call <tool> --args '<json>'   Invoke one MCP tool
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    case "init":
      runInit();
      return;
    case "doctor":
      process.exitCode = runDoctor();
      return;
    case "hh:login":
    case "login":
      await run.hhLogin();
      return;

    case "hh:search":
    case "search":
      await run.search();
      return;
    case "score":
      await run.score();
      return;
    case "hh:sync":
    case "sync":
      await run.sync();
      return;
    case "letters:generate":
    case "letters":
    case "package":
      await run.letters();
      return;
    case "apply":
      await run.apply(args);
      return;
    case "notify":
      await run.notify();
      return;
    case "start":
      await run.start();
      return; // long-lived

    case "consolidate":
      await run.consolidate();
      return;
    case "report":
    case "reflect:daily":
      run.report(args);
      return;
    case "reflect:weekly":
      run.report({ ...args, flags: { ...args.flags, weekly: true } });
      return;
    case "resume":
      if (args.positionals[0] === "render") {
        run.resumeRender(args);
      } else {
        console.error("Usage: job-search resume render [--variant <name>]");
        process.exitCode = 1;
      }
      return;

    case "vacancies":
      if (args.positionals[0] === "show")
        run.vacancyShow({ ...args, positionals: args.positionals.slice(1) });
      else run.vacanciesList(args);
      return;
    case "applications":
      run.applicationsList();
      return;
    case "funnel":
      run.funnel();
      return;
    case "queue:review":
    case "queue":
      run.queueReview(args);
      return;

    case "db":
      if (args.positionals[0] === "migrate") run.dbMigrate();
      else {
        console.error("Usage: job-search db migrate");
        process.exitCode = 1;
      }
      return;
    case "mcp":
      await run.mcp(args);
      return; // mcp serve is long-lived

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
