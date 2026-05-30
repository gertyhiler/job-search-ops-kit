import { createContext } from "../context.ts";
import { runScore } from "../pipeline/index.ts";

const ctx = createContext();
const report = await runScore(ctx);
ctx.logger.info({ report }, "score:once complete");
ctx.db.close();
process.exit(0);
