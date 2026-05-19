import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, "..", "..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: [
    "@job-search/core",
    "@job-search/mcp-server",
    "@job-search/runtime"
  ],
  experimental: {
    externalDir: true
  },
  outputFileTracingRoot: repoRoot
};

export default nextConfig;
