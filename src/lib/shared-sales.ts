import { z } from "zod";
import { parseImportedSales, type ImportedSales } from "./imported-sales";
import type { ManagerCashExpense, ManagerDailyReport } from "./manager-daily";
export type SharedCashRow = { transaction_date: string; source_order: number; category: string; description: string; receipt_jpy: number; payment_jpy: number; balance_jpy: number };
export type SharedFinanceDetails = {
  sync?: { attempted_at: string; last_success_at: string | null; status: string };
  cashMonths?: { store_id: "honten" | "816"; month: string; opening_jpy: number; rows: SharedCashRow[] }[];
  cashStatuses?: { store_id: "honten" | "816"; month: string; status: string; message_code: string; last_success_at: string | null }[];
  cashUnavailable?: boolean;
  managerDailyStatus?: "ready" | "setup-required" | "unavailable";
  managerReports?: ManagerDailyReport[];
  managerExpenses?: ManagerCashExpense[];
};
export type SharedSalesState = SharedFinanceDetails & (
  | { status: "ready"; data: ImportedSales }
  | { status: "pending" | "unavailable" | "restricted" });
const nullableMoney = z.number().int().min(0).max(10_000_000_000).nullable();
const rawRow = z.object({
  store_id: z.enum(["honten", "816"]), sales_date: z.string(),
  sales_jpy: nullableMoney, cumulative_jpy: nullableMoney,
  reported_yoy: z.number().min(0).max(10000).nullable(),
  labor_minutes: z.number().int().min(0).max(600000).nullable().optional(),
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
    days.get(row.sales_date)![row.store_id] = { sales: row.sales_jpy, cumulative: row.cumulative_jpy, reportedYoy: row.reported_yoy, laborMinutes: row.labor_minutes ?? null };
  }
  // The same parser as the reviewed import validates every month's cumulative sums.
  // A store hidden by RLS stays null; it is never fetched with an administrator key.
  return parseImportedSales(JSON.stringify({ version: 1, source: batch.source, asOf: batch.as_of, rows: [...days.values()] }));
}

export function canonicalSalesFromRows(input: unknown): ImportedSales {
  const rows = rawRow.omit({ cumulative_jpy: true }).array().min(1).max(3000).parse(input);
  const totals = new Map<string, number>();
  const ordered = [...rows].sort((a,b) => a.sales_date.localeCompare(b.sales_date));
  const withTotals = ordered.map(row => {
    const key = `${row.store_id}/${row.sales_date.slice(0,7)}`;
    const total = (totals.get(key) ?? 0) + (row.sales_jpy ?? 0);
    totals.set(key,total);
    return { ...row, cumulative_jpy: total };
  });
  return sharedSalesFromRows({ source: "登録済み実績・営業日報連携", as_of: ordered.at(-1)!.sales_date }, withTotals);
}
const cashRowSchema = z.object({ transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), source_order: z.number().int().positive(), category: z.string().min(1).max(100), description: z.string().max(500), receipt_jpy: z.number().int().nonnegative(), payment_jpy: z.number().int().nonnegative(), balance_jpy: z.number().int() });
export function sharedCashFromRows(header: unknown, input: unknown) {
  const batch = z.object({ month: z.string().regex(/^\d{4}-\d{2}-01$/), opening_jpy: z.number().int() }).parse(header);
  const rows = cashRowSchema.array().min(1).max(5000).parse(input);
  let balance = batch.opening_jpy, previous = "";
  const orders = new Set<number>();
  for (const row of rows) {
    if (!row.transaction_date.startsWith(batch.month.slice(0,7)) || row.transaction_date < previous || orders.has(row.source_order)) throw new Error("出納帳の順序を確認してください");
    orders.add(row.source_order); previous = row.transaction_date;
    balance += row.receipt_jpy-row.payment_jpy;
    if (balance !== row.balance_jpy) throw new Error("出納帳の残高を確認してください");
  }
  return {...batch, rows};
}
