import { createContext } from "../context.ts";
import { runNotify } from "../pipeline/index.ts";

const ctx = createContext();
const report = await runNotify(ctx);
ctx.logger.info({ report }, "notify:once complete");
ctx.db.close();
process.exit(0);
