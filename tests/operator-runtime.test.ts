import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildOperatorBundle,
  installOperatorBundle,
  updateOperatorBundle,
} from "../scripts/lib/operator-runtime.ts";

async function withTempRoots(
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "job-search-operator-"),
  );
  try {
    await fn(tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("buildOperatorBundle creates manifest and operator asset layout", async () => {
  await withTempRoots(async (tempRoot) => {
    const bundleRoot = path.join(tempRoot, "bundle");
    const result = await buildOperatorBundle({ outputRoot: bundleRoot });

    assert.equal(result.bundleRoot, bundleRoot);
    assert.ok(result.files.includes("AGENTS.md"));
    assert.ok(result.files.includes(".codex/hooks.json"));
    assert.ok(result.files.includes(".codex/hooks/session-start.ts"));
    assert.ok(result.files.includes(".agents/skills/scout/SKILL.md"));
    assert.ok(result.files.includes(".agents/skills/onboarding/SKILL.md"));
    assert.ok(result.files.includes(".agents/skills/mcp-transport/SKILL.md"));
    assert.ok(result.files.includes("prompts/roles/onboarding.md"));
    assert.ok(result.files.includes("prompts/roles/mcp-transport.md"));
    assert.ok(result.files.includes(".codex/config.template.toml"));
    assert.ok(result.files.includes("packages/mcp-server/dist/index.js"));
    assert.ok(result.files.includes("packages/runtime/dist/index.js"));
    assert.ok(
      result.files.includes(
        "packages/control-plane/.next/standalone/packages/control-plane/server.js",
      ),
    );

    const manifest = JSON.parse(
      await fs.readFile(result.manifestPath, "utf8"),
    ) as { files: string[] };
    assert.ok(manifest.files.includes(".cursor/mcp.template.json"));
  });
});

test("installOperatorBundle installs isolated app/config/data/state roots and renders launchers", async () => {
  await withTempRoots(async (tempRoot) => {
    const bundleRoot = path.join(tempRoot, "bundle");
    await buildOperatorBundle({ outputRoot: bundleRoot });

    const result = await installOperatorBundle({
      bundleRoot,
      appRoot: path.join(tempRoot, "app"),
      binRoot: path.join(tempRoot, "bin"),
      cacheRoot: path.join(tempRoot, "cache"),
      configRoot: path.join(tempRoot, "config"),
      dataRoot: path.join(tempRoot, "data"),
      stateRoot: path.join(tempRoot, "state"),
    });

    const codexConfig = await fs.readFile(
      path.join(result.appRoot, ".codex", "config.toml"),
      "utf8",
    );
    const launcher = await fs.readFile(
      path.join(result.binRoot, "job-search"),
      "utf8",
    );

    assert.ok(codexConfig.includes("[mcp_servers.job-search]"));
    assert.ok(codexConfig.includes(result.dataRoot));
    assert.ok(!codexConfig.includes(process.cwd()));
    await assert.rejects(async () =>
      fs.access(path.join(result.appRoot, ".codex", "mcp.json")),
    );
    assert.ok(launcher.includes(result.appRoot));
    assert.ok(await fs.stat(path.join(result.configRoot, ".env.local")));
    assert.ok(await fs.stat(path.join(result.dataRoot, "memory", "profile")));
    assert.ok(
      await fs.stat(path.join(result.dataRoot, "memory", "onboarding")),
    );
    assert.ok(
      await fs.stat(path.join(result.dataRoot, "memory", "session-logs")),
    );
    assert.ok(
      await fs.stat(
        path.join(
          result.dataRoot,
          "memory",
          "strategy",
          "active-strategy.yaml",
        ),
      ),
    );
    assert.ok(await fs.stat(path.join(result.stateRoot, "audit")));
    assert.ok(await fs.stat(path.join(result.stateRoot, "control-plane")));
    assert.ok(
      await fs.stat(
        path.join(
          result.appRoot,
          "packages",
          "control-plane",
          ".next",
          "standalone",
          "packages",
          "control-plane",
          "server.js",
        ),
      ),
    );

    const nextLink = await fs.readlink(
      path.join(
        result.appRoot,
        "packages",
        "control-plane",
        ".next",
        "standalone",
        "packages",
        "control-plane",
        "node_modules",
        "next",
      ),
    );
    assert.match(nextLink, /^\.\.\//);
  });
});

test("updateOperatorBundle preserves previous install and refreshes the runtime app", async () => {
  await withTempRoots(async (tempRoot) => {
    const roots = {
      appRoot: path.join(tempRoot, "app"),
      binRoot: path.join(tempRoot, "bin"),
      cacheRoot: path.join(tempRoot, "cache"),
      configRoot: path.join(tempRoot, "config"),
      dataRoot: path.join(tempRoot, "data"),
      stateRoot: path.join(tempRoot, "state"),
    };

    const firstBundle = path.join(tempRoot, "bundle-a");
    await buildOperatorBundle({ outputRoot: firstBundle });
    await installOperatorBundle({ ...roots, bundleRoot: firstBundle });
    await fs.writeFile(
      path.join(roots.appRoot, "LOCAL_MARKER"),
      "old\n",
      "utf8",
    );

    const secondBundle = path.join(tempRoot, "bundle-b");
    await buildOperatorBundle({ outputRoot: secondBundle });
    await updateOperatorBundle({ ...roots, bundleRoot: secondBundle });

    const previousMarker = await fs.readFile(
      path.join(`${roots.appRoot}.previous`, "LOCAL_MARKER"),
      "utf8",
    );
    assert.equal(previousMarker, "old\n");
    assert.ok(await fs.stat(path.join(roots.stateRoot, "job-search.db")));
  });
});
