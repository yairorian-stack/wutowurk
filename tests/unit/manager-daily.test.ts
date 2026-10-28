import { describe, expect, it } from "vitest";
import {
  managerDailyInputSchema,
  managerSalesTotal,
  mergeManagerCashMonth,
  type ManagerCashExpense,
  type ManagerDailyInput,
  type ManagerDailyReport,
} from "../../src/lib/manager-daily";
import type { SharedCashRow } from "../../src/lib/shared-sales";

const input: ManagerDailyInput = {
  storeId: "honten",
  reportDate: "2026-10-27",
  cashSalesJpy: 4_000,
  creditSalesJpy: 3_000,
  qrSalesJpy: 2_000,
  giftCertificateJpy: 1_000,
  otherCashlessJpy: 0,
  laborMinutes: 720,
  voucherCount: 2,
  voucherDiscountJpy: 500,
  memo: "引き継ぎ事項",
  expenses: [
    { category: "仕入れ", description: "食材レシート", amountJpy: 500 },
  ],
};

describe("manager daily report", () => {
  it("accepts a complete daily report and calculates total sales", () => {
    expect(managerDailyInputSchema.safeParse(input).success).toBe(true);
    expect(managerSalesTotal(input)).toBe(10_000);
  });

  it("rejects incomplete or unsafe receipt payments", () => {
    expect(
      managerDailyInputSchema.safeParse({
        ...input,
        expenses: [{ category: "", description: "receipt", amountJpy: 500 }],
      }).success,
    ).toBe(false);
    expect(
      managerDailyInputSchema.safeParse({
        ...input,
        expenses: [{ category: "仕入れ", description: "receipt", amountJpy: -1 }],
      }).success,
    ).toBe(false);
  });

  it("replaces imported rows for the entered date and recalculates cash balance", () => {
    const base: SharedCashRow[] = [
      {
        transaction_date: "2026-10-27",
        source_order: 1,
        category: "古い売上",
        description: "取込値",
        receipt_jpy: 8_000,
        payment_jpy: 0,
        balance_jpy: 9_000,
      },
      {
        transaction_date: "2026-10-28",
        source_order: 2,
        category: "売上",
        description: "翌日",
        receipt_jpy: 2_000,
        payment_jpy: 0,
        balance_jpy: 11_000,
      },
    ];
    const report: ManagerDailyReport = {
      store_id: "honten",
      report_date: "2026-10-27",
      sales_jpy: 10_000,
      cash_sales_jpy: 4_000,
      credit_sales_jpy: 3_000,
      qr_sales_jpy: 2_000,
      gift_certificate_jpy: 1_000,
      other_cashless_jpy: 0,
      labor_minutes: 720,
      voucher_count: 2,
      voucher_discount_jpy: 500,
      memo: "引き継ぎ事項",
      revision: 1,
      updated_at: "2026-10-27T15:00:00.000Z",
    };
    const expenses: ManagerCashExpense[] = [
      {
        store_id: "honten",
        report_date: "2026-10-27",
        sort_order: 1,
        category: "仕入れ",
        description: "食材レシート",
        amount_jpy: 500,
      },
    ];

    const merged = mergeManagerCashMonth(1_000, base, [report], expenses);

    expect(merged.some((row) => row.category === "古い売上")).toBe(false);
    expect(merged.filter((row) => row.transaction_date === "2026-10-27")).toHaveLength(6);
    expect(merged.find((row) => row.category === "売上")?.receipt_jpy).toBe(10_000);
    expect(merged.find((row) => row.category === "仕入れ")?.payment_jpy).toBe(500);
    expect(merged.find((row) => row.category === "割引券")?.description).toBe(
      "2枚・割引 500円",
    );
    expect(merged.at(-1)).toMatchObject({
      transaction_date: "2026-10-28",
      balance_jpy: 6_500,
    });
  });
});
