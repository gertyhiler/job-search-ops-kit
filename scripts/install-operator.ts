import { buildOperatorBundle, installOperatorBundle } from "./lib/operator-runtime.ts";

await buildOperatorBundle();
const result = await installOperatorBundle();

console.log(`Installed operator app: ${result.appRoot}`);
console.log(`Config root: ${result.configRoot}`);
console.log(`Data root: ${result.dataRoot}`);
console.log(`State root: ${result.stateRoot}`);
console.log(`Launchers: ${result.launcherPaths.join(", ")}`);
