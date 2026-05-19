import { Buffer } from "node:buffer";

interface JsonRpcRequest {
  id?: string | number | null;
  method: string;
}

function sendMessage(message: unknown): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, payload]));
}

function sendResult(id: string | number | null | undefined, result: unknown): void {
  if (id == null) {
    return;
  }
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id: string | number | null | undefined, message: string): void {
  if (id == null) {
    return;
  }
  sendMessage({ jsonrpc: "2.0", id, error: { code: -32000, message } });
}

function parseMessages(onMessage: (request: JsonRpcRequest) => void): void {
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
      onMessage(JSON.parse(payload) as JsonRpcRequest);
    }
  });
}

export async function startBrowserAutomationStub(): Promise<void> {
  parseMessages((request) => {
    switch (request.method) {
      case "initialize":
        sendResult(request.id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "job-search-browser-automation", version: "0.1.0" }
        });
        return;
      case "notifications/initialized":
        return;
      case "tools/list":
        sendResult(request.id, { tools: [] });
        return;
      case "tools/call":
        sendError(request.id, "not_implemented_until_m7");
        return;
      default:
        sendError(request.id, `Unsupported method: ${request.method}`);
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await startBrowserAutomationStub();
}
