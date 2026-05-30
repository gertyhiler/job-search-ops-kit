// Optional flags: --real forces real submission, --dry-run forces simulation.
if (process.argv.includes("--real")) process.env.AUTO_APPLY_MODE = "real";
if (process.argv.includes("--dry-run")) process.env.AUTO_APPLY_MODE = "dry_run";

const { createContext } = await import("../context.ts");
const { runApply } = await import("../pipeline/index.ts");

const ctx = createContext();
const report = await runApply(ctx);
ctx.logger.info(
  { report, mode: ctx.env.AUTO_APPLY_MODE },
  "apply:once complete",
);
ctx.db.close();
process.exit(0);
