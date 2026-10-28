import { describe, expect, it } from "vitest";
import {
  managerDailyInputSchema,
  managerDailyRowSchema,
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
  cashSalesLabel: "店頭現金",
  creditSalesJpy: 3_000,
  creditSalesLabel: "VISA・JCB",
  qrSalesJpy: 2_000,
  qrSalesLabel: "PayPay",
  giftCertificateJpy: 1_000,
  giftCertificateLabel: "徳島県食事券",
  otherCashlessJpy: 0,
  otherCashlessLabel: "",
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

  it("accepts optional tender labels and rejects unsafe labels", () => {
    expect(managerDailyInputSchema.safeParse(input).success).toBe(true);
    expect(
      managerDailyInputSchema.safeParse({
        ...input,
        qrSalesLabel: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      managerDailyInputSchema.safeParse({
        ...input,
        creditSalesLabel: "VISA\u0000JCB",
      }).success,
    ).toBe(false);
  });

  it("treats labels from existing reports as empty when absent", () => {
    const parsed = managerDailyRowSchema.parse({
      store_id: "honten",
      report_date: "2026-10-26",
      sales_jpy: 100,
      cash_sales_jpy: 100,
      credit_sales_jpy: 0,
      qr_sales_jpy: 0,
      gift_certificate_jpy: 0,
      other_cashless_jpy: 0,
      labor_minutes: 60,
      voucher_count: 0,
      voucher_discount_jpy: 0,
      memo: "",
      revision: 1,
      updated_at: "2026-10-26T00:00:00.000Z",
    });
    expect(parsed.cash_sales_label).toBe("");
    expect(parsed.other_cashless_label).toBe("");
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
      cash_sales_label: "店頭現金",
      credit_sales_jpy: 3_000,
      credit_sales_label: "VISA・JCB",
      qr_sales_jpy: 2_000,
      qr_sales_label: "PayPay",
      gift_certificate_jpy: 1_000,
      gift_certificate_label: "徳島県食事券",
      other_cashless_jpy: 0,
      other_cashless_label: "",
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
    expect(merged.find((row) => row.category === "クレジット")?.description).toBe(
      "VISA・JCB",
    );
    expect(merged.find((row) => row.category === "売上")?.description).toContain(
      "店頭現金",
    );
    expect(merged.find((row) => row.category === "割引券")?.description).toBe(
      "2枚・割引 500円",
    );
    expect(merged.at(-1)).toMatchObject({
      transaction_date: "2026-10-28",
      balance_jpy: 6_500,
    });
  });
});
