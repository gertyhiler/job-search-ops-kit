import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContext } from "@job-search/service";
import { buildTools, type ToolDef } from "./tools.ts";

export { buildTools };
export type { ToolDef };

/** Invoke a single tool out-of-band (used by `job-search mcp call`). */
export async function callToolOnce(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ctx = createContext();
  try {
    const tool = buildTools().find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `Unknown tool "${name}". Available: ${buildTools()
          .map((t) => t.name)
          .join(", ")}`,
      );
    }
    return await tool.handler(args, ctx);
  } finally {
    ctx.db.close();
  }
}

export function listToolNames(): string[] {
  return buildTools().map((t) => t.name);
}

/** Start the MCP server over stdio (the strict channel for agents). */
export async function startMcpServer(): Promise<void> {
  const ctx = createContext();
  const server = new McpServer({ name: "job-search", version: "0.1.0" });

  for (const tool of buildTools()) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputShape },
      async (args: Record<string, unknown>) => {
        const data = await tool.handler(args ?? {}, ctx);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data ?? null, null, 2),
            },
          ],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  ctx.logger.info(
    { tools: listToolNames().length },
    "MCP server connected over stdio",
  );
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startMcpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
