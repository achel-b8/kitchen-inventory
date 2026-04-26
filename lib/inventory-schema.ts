import * as z from "zod/v4";

export const INVENTORY_CATEGORIES = ["生鮮", "調味料", "乾物", "冷凍庫"] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JST_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?\+09:00$/;

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

function isValidJstIsoDateTime(value: string): boolean {
  const match = value.match(JST_ISO_PATTERN);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  return (
    isValidDateOnly(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

export function toJstIsoString(date = new Date()): string {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    `${jstDate.getUTCFullYear()}-${pad(jstDate.getUTCMonth() + 1)}-${pad(jstDate.getUTCDate())}`,
    "T",
    `${pad(jstDate.getUTCHours())}:${pad(jstDate.getUTCMinutes())}:${pad(jstDate.getUTCSeconds())}`,
    "+09:00"
  ].join("");
}

export const DateOnlySchema = z
  .string()
  .refine(isValidDateOnly, "追加日は YYYY-MM-DD 形式の実在する日付にしてください");

export const JstIsoDateTimeSchema = z
  .string()
  .refine(isValidJstIsoDateTime, "updated_at は日本時間の ISO 8601 文字列にしてください");

export const InventoryItemSchema = z.strictObject({
  商品名: z.string().refine((value) => value.trim().length > 0, "商品名は空にできません"),
  追加日: DateOnlySchema,
  数: z.number().finite().nonnegative().optional(),
  単位: z.string().refine((value) => value.trim().length > 0, "単位は空にできません").optional()
}).superRefine((item, context) => {
  if (item.単位 !== undefined && item.数 === undefined) {
    context.addIssue({
      code: "custom",
      message: "単位を指定する場合は数も指定してください",
      path: ["数"]
    });
  }
});

export const InventoryBucketsSchema = z.strictObject({
  生鮮: z.array(InventoryItemSchema),
  調味料: z.array(InventoryItemSchema),
  乾物: z.array(InventoryItemSchema),
  冷凍庫: z.array(InventoryItemSchema)
});

export const InventoryDocumentSchema = z
  .strictObject({
    schema_version: z.literal(1),
    updated_at: JstIsoDateTimeSchema,
    inventory: InventoryBucketsSchema
  })
  .superRefine((document, context) => {
    for (const category of INVENTORY_CATEGORIES) {
      const seen = new Set<string>();

      document.inventory[category].forEach((item, index) => {
        const identity = `${item.商品名}\u0000${item.追加日}\u0000${item.単位 ?? ""}`;

        if (seen.has(identity)) {
          context.addIssue({
            code: "custom",
            message: "同一分類、同一商品名、同一追加日、同一単位の重複レコードは許可されません",
            path: ["inventory", category, index]
          });
          return;
        }

        seen.add(identity);
      });
    }
  });

export type InventoryDocument = z.infer<typeof InventoryDocumentSchema>;

export type InventoryValidationResult =
  | {
      ok: true;
      inventory: InventoryDocument;
    }
  | {
      ok: false;
      issues: string[];
    };

export function validateInventoryDocument(input: unknown): InventoryValidationResult {
  const parsed = InventoryDocumentSchema.safeParse(input);

  if (parsed.success) {
    return {
      ok: true,
      inventory: parsed.data
    };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
  };
}
