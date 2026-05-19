import { buildOperatorBundle } from "./lib/operator-runtime.ts";

const result = await buildOperatorBundle();
console.log(`Operator bundle ready: ${result.bundleRoot}`);
console.log(`Version: ${result.version}`);
console.log(`Files: ${result.files.length}`);
