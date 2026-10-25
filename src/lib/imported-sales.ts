import { z } from "zod";

export const IMPORTED_SALES_KEY = "wuto-wurk-imported-sales-v1";
export const IMPORTED_SALES_ELEMENT_ID = "wuto-wurk-imported-sales";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "日付を確認してください");
const money = z.number().int().min(0).max(10_000_000_000).nullable();
const storeValues = z.object({
  sales: money,
  cumulative: money,
  reportedYoy: z.number().min(0).max(10000).nullable(),
});
export const importedSalesSchema = z
  .object({
    version: z.literal(1),
    source: z.string().trim().min(1).max(100),
    asOf: date,
    rows: z
      .array(z.object({ date, honten: storeValues, "816": storeValues }))
      .min(1)
      .max(1500),
  })
  .superRefine((data, ctx) => {
    const dates = new Set<string>();
    const totals: Record<string, number> = {};
    for (const row of [...data.rows].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      if (dates.has(row.date))
        ctx.addIssue({
          code: "custom",
          message: `${row.date} が重複しています`,
        });
      dates.add(row.date);
      for (const store of ["honten", "816"] as const) {
        const key = `${row.date.slice(0, 7)}-${store}`;
        totals[key] = (totals[key] ?? 0) + (row[store].sales ?? 0);
        if (row.date > data.asOf && row[store].sales !== null)
          ctx.addIssue({
            code: "custom",
            message: `${row.date} は集計基準日より後の売上です`,
          });
        if (
          row[store].cumulative !== null &&
          row[store].cumulative !== totals[key]
        )
          ctx.addIssue({
            code: "custom",
            message: `${row.date} ${store === "honten" ? "本店" : "羽ノ浦店"}の日別合計と月累計が一致しません`,
          });
      }
    }
  });
export type ImportedSales = z.infer<typeof importedSalesSchema>;
export type SalesScope = "honten" | "816" | "all";

export function readInitialSales(): {
  data: ImportedSales | null;
  error: string;
} {
  if (typeof document === "undefined") return { data: null, error: "" };
  try {
    const raw =
      document.getElementById(IMPORTED_SALES_ELEMENT_ID)?.textContent ||
      localStorage.getItem(IMPORTED_SALES_KEY);
    return { data: raw ? parseImportedSales(raw) : null, error: "" };
  } catch (e) {
    return {
      data: null,
      error:
        e instanceof Error
          ? e.message
          : "売上を読み込めません。保存済みの内容は変更していません。",
    };
  }
}

export function parseImportedSales(raw: string): ImportedSales {
  if (raw.length > 2_000_000)
    throw new Error("売上ファイルは2MB以内にしてください");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("売上JSONファイルの形式を確認してください");
  }
  const parsed = importedSalesSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return {
    ...parsed.data,
    rows: parsed.data.rows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
export function salesMonthSummary(
  data: ImportedSales,
  month: string,
  scope: SalesScope,
) {
  const rows = data.rows.filter(
    (r) => r.date.startsWith(`${month}-`) && r.date <= data.asOf,
  );
  const ids: ("honten" | "816")[] =
    scope === "all" ? ["honten", "816"] : [scope];
  const total = rows.reduce(
    (sum, row) => sum + ids.reduce((s, id) => s + (row[id].sales ?? 0), 0),
    0,
  );
  const entered = rows.reduce(
    (sum, row) => sum + ids.filter((id) => row[id].sales !== null).length,
    0,
  );
  const last = rows.at(-1);
  return {
    total,
    entered,
    missing: rows.length * ids.length - entered,
    rows,
    lastDate: last?.date ?? null,
    // Source percentages are rounded cumulative comparisons. Do not derive or average last year's sales.
    reportedYoy: scope === "all" ? null : (last?.[scope].reportedYoy ?? null),
  };
}
