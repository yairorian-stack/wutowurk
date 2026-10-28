import { z } from "zod";
import type { SharedCashRow } from "./shared-sales";

const money = z.number().int().min(0).max(10_000_000_000);
const shortMoney = z.number().int().min(1).max(100_000_000);
const store = z.enum(["honten", "816"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));

export const managerExpenseInputSchema = z.object({
  category: cleanText(80).pipe(z.string().min(1, "区分を入力してください")),
  description: cleanText(200).pipe(
    z.string().min(1, "レシート・支払いの摘要を入力してください"),
  ),
  amountJpy: shortMoney,
});

export const managerDailyInputSchema = z.object({
  storeId: store,
  reportDate: isoDate,
  cashSalesJpy: money,
  creditSalesJpy: money,
  qrSalesJpy: money,
  giftCertificateJpy: money,
  otherCashlessJpy: money,
  laborMinutes: z.number().int().min(0).max(600_000),
  voucherCount: z.number().int().min(0).max(100_000),
  voucherDiscountJpy: money,
  memo: cleanText(1200),
  expenses: managerExpenseInputSchema.array().max(30),
});

export type ManagerDailyInput = z.infer<typeof managerDailyInputSchema>;

export const managerDailyRowSchema = z.object({
  store_id: store,
  report_date: isoDate,
  sales_jpy: money,
  cash_sales_jpy: money,
  credit_sales_jpy: money,
  qr_sales_jpy: money,
  gift_certificate_jpy: money,
  other_cashless_jpy: money,
  labor_minutes: z.number().int().min(0).max(600_000),
  voucher_count: z.number().int().min(0).max(100_000),
  voucher_discount_jpy: money,
  memo: z.string().max(1200),
  revision: z.number().int().positive(),
  updated_at: z.string(),
});

export const managerExpenseRowSchema = z.object({
  store_id: store,
  report_date: isoDate,
  sort_order: z.number().int().min(1).max(30),
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  amount_jpy: shortMoney,
});

export type ManagerDailyReport = z.infer<typeof managerDailyRowSchema>;
export type ManagerCashExpense = z.infer<typeof managerExpenseRowSchema>;

export function managerSalesTotal(input: ManagerDailyInput) {
  return (
    input.cashSalesJpy +
    input.creditSalesJpy +
    input.qrSalesJpy +
    input.giftCertificateJpy +
    input.otherCashlessJpy
  );
}

function managerCashRows(
  report: ManagerDailyReport,
  expenses: ManagerCashExpense[],
) {
  const rows: Omit<SharedCashRow, "source_order" | "balance_jpy">[] = [
    {
      transaction_date: report.report_date,
      category: "売上",
      description: "店長日報入力",
      receipt_jpy: report.sales_jpy,
      payment_jpy: 0,
    },
  ];
  const nonCash = [
    ["クレジット", report.credit_sales_jpy],
    ["QR・電子マネー", report.qr_sales_jpy],
    ["商品券", report.gift_certificate_jpy],
    ["その他キャッシュレス", report.other_cashless_jpy],
  ] as const;
  for (const [category, amount] of nonCash)
    if (amount > 0)
      rows.push({
        transaction_date: report.report_date,
        category,
        description: "店長日報・決済内訳",
        receipt_jpy: 0,
        payment_jpy: amount,
      });
  if (report.voucher_count > 0 || report.voucher_discount_jpy > 0)
    rows.push({
      transaction_date: report.report_date,
      category: "割引券",
      description: `${report.voucher_count}枚・割引 ${report.voucher_discount_jpy.toLocaleString("ja-JP")}円`,
      receipt_jpy: 0,
      payment_jpy: 0,
    });
  for (const expense of expenses)
    rows.push({
      transaction_date: report.report_date,
      category: expense.category,
      description: expense.description,
      receipt_jpy: 0,
      payment_jpy: expense.amount_jpy,
    });
  return rows;
}

export function mergeManagerCashMonth(
  openingJpy: number,
  rows: SharedCashRow[],
  reports: ManagerDailyReport[],
  expenses: ManagerCashExpense[],
) {
  const dates = new Set(reports.map((report) => report.report_date));
  const merged = [
    ...rows
      .filter((row) => !dates.has(row.transaction_date))
      .map((row) => ({
        transaction_date: row.transaction_date,
        category: row.category,
        description: row.description,
        receipt_jpy: row.receipt_jpy,
        payment_jpy: row.payment_jpy,
      })),
    ...reports.flatMap((report) =>
      managerCashRows(
        report,
        expenses
          .filter(
            (expense) =>
              expense.store_id === report.store_id &&
              expense.report_date === report.report_date,
          )
          .sort((a, b) => a.sort_order - b.sort_order),
      ),
    ),
  ].sort(
    (a, b) =>
      a.transaction_date.localeCompare(b.transaction_date) ||
      a.category.localeCompare(b.category),
  );
  let balance = openingJpy;
  return merged.map((row, index) => {
    balance += row.receipt_jpy - row.payment_jpy;
    return { ...row, source_order: index + 1, balance_jpy: balance };
  });
}
