import { createContext } from "../context.ts";
import { runSearch } from "../pipeline/index.ts";

const ctx = createContext();
const report = await runSearch(ctx);
ctx.logger.info({ report }, "search:once complete");
ctx.db.close();
process.exit(0);
