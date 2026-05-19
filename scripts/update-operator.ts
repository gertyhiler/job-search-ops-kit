import { buildOperatorBundle, updateOperatorBundle } from "./lib/operator-runtime.ts";

await buildOperatorBundle();
const result = await updateOperatorBundle();

console.log(`Updated operator app: ${result.appRoot}`);
console.log(`Config root: ${result.configRoot}`);
console.log(`Data root: ${result.dataRoot}`);
console.log(`State root: ${result.stateRoot}`);
