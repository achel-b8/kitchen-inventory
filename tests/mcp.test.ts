import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../api/mcp.js";

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
