import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { authenticateMcpRequest, createServer } from "../api/mcp.js";

describe("MCP server", () => {
  it("exposes only write_inventory", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "kitchen-inventory-test", version: "0.1.0" });
    const server = createServer();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toEqual(["write_inventory"]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("MCP endpoint authentication", () => {
  it("fails closed when MCP_API_KEY is not configured", () => {
    const result = authenticateMcpRequest(
      {
        headers: {
          authorization: "Bearer correct-key"
        }
      },
      {}
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "configuration_error",
      message: "MCP API key is not configured"
    });
  });

  it("rejects missing or invalid API keys", () => {
    expect(
      authenticateMcpRequest(
        {
          headers: {}
        },
        { MCP_API_KEY: "correct-key" }
      )
    ).toMatchObject({
      ok: false,
      status: 401,
      error: "unauthorized"
    });

    expect(
      authenticateMcpRequest(
        {
          headers: {
            authorization: "Bearer wrong-key"
          }
        },
        { MCP_API_KEY: "correct-key" }
      )
    ).toMatchObject({
      ok: false,
      status: 401,
      error: "unauthorized"
    });
  });

  it("accepts API keys from supported request locations", () => {
    const env = { MCP_API_KEY: "correct-key" };

    expect(
      authenticateMcpRequest(
        {
          headers: {
            authorization: "Bearer correct-key"
          }
        },
        env
      )
    ).toEqual({ ok: true });

    expect(
      authenticateMcpRequest(
        {
          headers: {
            "x-api-key": "correct-key"
          }
        },
        env
      )
    ).toEqual({ ok: true });

    expect(
      authenticateMcpRequest(
        {
          headers: {},
          query: {
            api_key: "correct-key"
          }
        },
        env
      )
    ).toEqual({ ok: true });
  });
});
