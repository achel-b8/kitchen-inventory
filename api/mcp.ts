import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { writeInventory } from "../lib/github.js";

const writeInventoryInputSchema = {
  inventory: z.unknown().describe("更新後の inventory.json 全体。サーバー側で厳密に検証されます。"),
  expected_updated_at: z.unknown().optional().describe("読み取り時点の updated_at。指定時は競合検出に使います。"),
  commit_message: z.unknown().optional().describe("GitHub に作成するコミットメッセージ。未指定時は Update inventory。")
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

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
}

function methodNotAllowed(res: VercelResponse): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed"
    },
    id: null
  });
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

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
