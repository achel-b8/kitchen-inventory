import { describe, expect, it } from "vitest";
import { loadGitHubConfig, writeInventory } from "../lib/github.js";

const validInventory = {
  schema_version: 1,
  updated_at: "2026-04-26T00:00:00+09:00",
  inventory: {
    生鮮: [],
    調味料: [],
    乾物: [],
    冷凍庫: []
  }
};

describe("GitHub configuration", () => {
  it("reports missing environment variables", () => {
    expect(() => loadGitHubConfig({})).toThrow("Missing environment variables");
  });
});

describe("writeInventory", () => {
  it("returns schema_error before checking GitHub configuration", async () => {
    const result = await writeInventory({
      inventory: {
        ...validInventory,
        inventory: {
          ...validInventory.inventory,
          冷蔵庫: []
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.error : "").toBe("schema_error");
  });

  it("returns configuration_error when GitHub env vars are missing", async () => {
    const originalEnv = process.env;
    process.env = {};

    try {
      const result = await writeInventory({
        inventory: validInventory
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false ? result.error : "").toBe("configuration_error");
    } finally {
      process.env = originalEnv;
    }
  });

  it("returns schema_error for invalid expected_updated_at and commit_message", async () => {
    const result = await writeInventory({
      inventory: validInventory,
      expected_updated_at: "2026-04-26T00:00:00Z",
      commit_message: 123
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.error : "").toBe("schema_error");
  });
});
