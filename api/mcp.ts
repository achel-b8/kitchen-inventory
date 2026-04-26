import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { writeInventory } from "../lib/github.js";

const writeInventoryInputSchema = {
  inventory: z.unknown().describe("更新後の inventory.json 全体。サーバー側で厳密に検証されます。"),
  expected_updated_at: z.unknown().optional().describe("読み取り時点の updated_at。指定時は競合検出に使います。"),
  commit_message: z.unknown().optional().describe("GitHub に作成するコミットメッセージ。未指定時は Update inventory。")
};

type HeaderValue = string | string[] | undefined;

type AuthRequest = {
  headers: Record<string, HeaderValue>;
  query?: Record<string, HeaderValue>;
};

export type McpAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 401 | 500;
      error: "unauthorized" | "configuration_error";
      message: string;
    };

export function createServer(): McpServer {
  const server = new McpServer({
    name: "kitchen-inventory",
    version: "0.1.0"
  });

  server.registerTool(
    "write_inventory",
    {
      title: "Write Inventory",
      description:
        "Validate the complete kitchen inventory JSON and commit only inventory.json to the configured GitHub repository.",
      inputSchema: writeInventoryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) => {
      const result = await writeInventory(args);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    }
  );

  return server;
}

function firstValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nonEmptyTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readBearerToken(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return nonEmptyTrimmed(match?.[1]);
}

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function secretsMatch(actual: string, expected: string): boolean {
  return timingSafeEqual(hashSecret(actual), hashSecret(expected));
}

function readRequestApiKey(req: AuthRequest): string | undefined {
  return (
    readBearerToken(firstValue(req.headers.authorization)) ??
    nonEmptyTrimmed(firstValue(req.headers["x-api-key"])) ??
    nonEmptyTrimmed(firstValue(req.query?.api_key))
  );
}

export function authenticateMcpRequest(
  req: AuthRequest,
  env: NodeJS.ProcessEnv = process.env
): McpAuthResult {
  const expectedApiKey = nonEmptyTrimmed(env.MCP_API_KEY);

  if (expectedApiKey === undefined) {
    return {
      ok: false,
      status: 500,
      error: "configuration_error",
      message: "MCP API key is not configured"
    };
  }

  const requestApiKey = readRequestApiKey(req);

  if (requestApiKey === undefined || !secretsMatch(requestApiKey, expectedApiKey)) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Unauthorized"
    };
  }

  return { ok: true };
}

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, mcp-session-id, mcp-protocol-version, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
}

function jsonRpcError(res: VercelResponse, status: number, code: number, message: string, data?: unknown): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    },
    id: null
  });
}

function methodNotAllowed(res: VercelResponse): void {
  jsonRpcError(res, 405, -32000, "Method not allowed");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res);
    return;
  }

  const auth = authenticateMcpRequest(req);

  if (!auth.ok) {
    jsonRpcError(res, auth.status, auth.status === 401 ? -32001 : -32603, auth.message, {
      error: auth.error
    });
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      jsonRpcError(res, 500, -32603, "Internal server error");
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
