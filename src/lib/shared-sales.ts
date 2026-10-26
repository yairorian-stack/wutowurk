import { z } from "zod";
import { parseImportedSales, type ImportedSales } from "./imported-sales";
export type SharedSalesState =
  | { status: "ready"; data: ImportedSales }
  | { status: "pending" | "unavailable" | "restricted" };
const nullableMoney = z.number().int().min(0).max(10_000_000_000).nullable();
const rawRow = z.object({
  store_id: z.enum(["honten", "816"]), sales_date: z.string(),
  sales_jpy: nullableMoney, cumulative_jpy: nullableMoney,
  reported_yoy: z.number().min(0).max(10000).nullable(),
});
export function sharedSalesFromRows(header: unknown, input: unknown): ImportedSales {
  const batch = z.object({ source: z.string().min(1).max(100), as_of: z.string() }).parse(header);
  const rows = rawRow.array().min(1).max(3000).parse(input);
  const days = new Map<string, ImportedSales["rows"][number]>(), seen = new Set<string>();
  for (const row of rows) {
    if (row.sales_date > batch.as_of) throw new Error("基準日後の実績は表示できません");
    const key = `${row.sales_date}/${row.store_id}`;
    if (seen.has(key)) throw new Error("店舗・日付が重複しています");
    seen.add(key);
    if (!days.has(row.sales_date)) days.set(row.sales_date, { date: row.sales_date,
      honten: { sales: null, cumulative: null, reportedYoy: null }, "816": { sales: null, cumulative: null, reportedYoy: null } });
    days.get(row.sales_date)![row.store_id] = { sales: row.sales_jpy, cumulative: row.cumulative_jpy, reportedYoy: row.reported_yoy };
  }
  // The same parser as the reviewed import validates every month's cumulative sums.
  // A store hidden by RLS stays null; it is never fetched with an administrator key.
  return parseImportedSales(JSON.stringify({ version: 1, source: batch.source, asOf: batch.as_of, rows: [...days.values()] }));
}
