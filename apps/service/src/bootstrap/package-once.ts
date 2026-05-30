import { createContext } from "../context.ts";
import { runPackage } from "../pipeline/index.ts";

const ctx = createContext();
const report = await runPackage(ctx);
ctx.logger.info({ report }, "package:once complete");
ctx.db.close();
process.exit(0);
