import { Buffer } from "node:buffer";
import http from "node:http";
import { JobSearchService, getToolDefinitions } from "./service.ts";

interface JsonRpcRequest {
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface McpServeOptions {
  transport?: "http" | "stdio";
  hostname?: string;
  port?: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

function toJsonRpcResponse(
  id: string | number | null | undefined,
  result: unknown,
  error?: { code: number; message: string }
): JsonRpcResponse | null {
  if (id == null) {
    return null;
  }

  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

function sendMessage(message: unknown): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, payload]));
}

function sendResult(id: string | number | null | undefined, result: unknown): void {
  const response = toJsonRpcResponse(id, result);
  if (!response) {
    return;
  }
  sendMessage(response);
}

function sendError(id: string | number | null | undefined, code: number, message: string): void {
  const response = toJsonRpcResponse(id, null, { code, message });
  if (!response) {
    return;
  }
  sendMessage(response);
}

function parseMessages(onMessage: (request: JsonRpcRequest) => Promise<void>): void {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerRaw = buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthHeader = headerRaw
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));

      if (!contentLengthHeader) {
        buffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(contentLengthHeader.split(":")[1].trim(), 10);
      const payloadStart = headerEnd + 4;
      const payloadEnd = payloadStart + contentLength;
      if (buffer.byteLength < payloadEnd) {
        return;
      }

      const payload = buffer.subarray(payloadStart, payloadEnd).toString("utf8");
      buffer = buffer.subarray(payloadEnd);

      void onMessage(JSON.parse(payload) as JsonRpcRequest);
    }
  });
}

async function handleRequest(service: JobSearchService, request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  try {
    switch (request.method) {
      case "initialize":
        return toJsonRpcResponse(request.id, {
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "job-search-mcp",
            version: "0.1.0"
          }
        });
      case "notifications/initialized":
        return null;
      case "ping":
        return toJsonRpcResponse(request.id, {});
      case "tools/list":
        return toJsonRpcResponse(request.id, {
          tools: getToolDefinitions()
        });
      case "tools/call": {
        const toolName = request.params?.name;
        const args = request.params?.arguments ?? {};
        const result = await service.callTool(toolName, args);
        return toJsonRpcResponse(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.result, null, 2)
            }
          ],
          structuredContent: result.result
        });
      }
      default:
        return toJsonRpcResponse(request.id, null, {
          code: -32601,
          message: `Method not found: ${request.method}`
        });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toJsonRpcResponse(request.id, null, {
      code: -32000,
      message
    });
  }
}

async function startHttpMcpServer(service: JobSearchService, options: McpServeOptions): Promise<void> {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 3760;
  const server = http.createServer(async (request, response) => {
    if (!request.url) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "missing url" }));
      return;
    }

    const url = new URL(request.url, `http://${hostname}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        server: "job-search-mcp"
      }));
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/mcp") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on("end", async () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const payload = JSON.parse(raw) as JsonRpcRequest;
        const rpcResponse = await handleRequest(service, payload);
        if (!rpcResponse) {
          response.writeHead(204);
          response.end();
          return;
        }

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(rpcResponse));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message
          }
        }));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export async function startMcpServer(options: McpServeOptions = {}): Promise<void> {
  const service = new JobSearchService();

  if (options.transport === "http") {
    await startHttpMcpServer(service, options);
    return;
  }

  parseMessages(async (request) => {
    const response = await handleRequest(service, request);
    if (!response) {
      return;
    }
    if (response.error) {
      sendError(response.id, response.error.code, response.error.message);
      return;
    }
    sendResult(response.id, response.result);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await startMcpServer();
}
