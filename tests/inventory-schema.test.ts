import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InventoryDocumentSchema, toJstIsoString, validateInventoryDocument } from "../lib/inventory-schema.js";

const baseInventory = {
  schema_version: 1,
  updated_at: "2026-04-26T00:00:00+09:00",
  inventory: {
    生鮮: [],
    調味料: [],
    乾物: [],
    冷凍庫: []
  }
};

describe("InventoryDocumentSchema", () => {
  it("accepts the repository inventory.json", () => {
    const inventoryPath = resolve(process.cwd(), "inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as unknown;

    expect(InventoryDocumentSchema.safeParse(inventory).success).toBe(true);
  });

  it("rejects unknown categories", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        冷蔵庫: []
      }
    });

    expect(result.ok).toBe(false);
  });

  it("rejects missing item names", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 追加日: "2026-04-26", 数: 1 }]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("rejects invalid added date format", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 商品名: "卵", 追加日: "2026/04/26", 数: 1 }]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("rejects impossible added dates", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 商品名: "卵", 追加日: "2026-02-31", 数: 1 }]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("rejects impossible updated_at dates", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      updated_at: "2026-02-31T00:00:00+09:00"
    });

    expect(result.ok).toBe(false);
  });

  it("rejects negative quantities", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 商品名: "卵", 追加日: "2026-04-26", 数: -1 }]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("accepts numeric amounts with units", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 商品名: "和牛切り落とし", 追加日: "2026-04-26", 数: 80, 単位: "g" }]
      }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects units without amounts", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [{ 商品名: "和牛切り落とし", 追加日: "2026-04-26", 単位: "g" }]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("rejects duplicate records in the same category", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [
          { 商品名: "卵", 追加日: "2026-04-26", 数: 1, 単位: "個" },
          { 商品名: "卵", 追加日: "2026-04-26", 数: 2, 単位: "個" }
        ]
      }
    });

    expect(result.ok).toBe(false);
  });

  it("allows records with the same item and date when units differ", () => {
    const result = validateInventoryDocument({
      ...baseInventory,
      inventory: {
        ...baseInventory.inventory,
        生鮮: [
          { 商品名: "牛肉", 追加日: "2026-04-26", 数: 80, 単位: "g" },
          { 商品名: "牛肉", 追加日: "2026-04-26", 数: 1, 単位: "個" }
        ]
      }
    });

    expect(result.ok).toBe(true);
  });

  it("formats server timestamps as Japanese ISO 8601 strings", () => {
    expect(toJstIsoString(new Date("2026-04-25T15:00:00.000Z"))).toBe("2026-04-26T00:00:00+09:00");
  });
});
