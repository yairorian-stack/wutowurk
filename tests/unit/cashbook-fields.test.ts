import { describe, expect, it } from "vitest";
import {
  balanceAt,
  cashCategoryLabel,
  createFinanceSeed,
  financeSchema,
  ledger,
  monthlySummary,
  saveCash,
  saveDaily,
  type CashInput,
  type FinanceState,
} from "../../src/lib/finance";
const session = { role: "company" as const, storeId: "honten" as const },
  now = "2026-10-21";
const fresh = (): FinanceState => ({
  version: 1,
  reports: [],
  movements: [],
  openings: [{ storeId: "honten", date: "2026-10-01", amount: 30000 }],
  history: [],
});
const cash = (overrides: Partial<CashInput> = {}): CashInput => ({
  storeId: "honten",
  date: "2026-10-01",
  direction: "出金",
  category: "仕入れ",
  amount: 3000,
  description: "架空の支出",
  ...overrides,
});
describe("追加出納項目", () => {
  it.each(["仕入れ", "寄付", "支払い"])("%s を記録", (category) => {
    const s = saveCash(fresh(), session, cash({ category }), undefined, now);
    expect(ledger(s, "honten")[0].category).toBe(category);
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(27000);
  });
  it("寄付は入金・出金を明示して残高に反映", () => {
    const s = saveCash(
      fresh(),
      session,
      cash({ direction: "入金", category: "寄付" }),
      undefined,
      now,
    );
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(33000);
  });
  it("自由項目は名称が必須で、明細・履歴に保存", () => {
    expect(() =>
      saveCash(
        fresh(),
        session,
        cash({ category: "自由項目", customCategory: " " }),
        undefined,
        now,
      ),
    ).toThrow("名称");
    const s = saveCash(
      fresh(),
      session,
      cash({ category: "自由項目", customCategory: "サンプル修繕費" }),
      undefined,
      now,
    );
    expect(ledger(s, "honten")[0].category).toBe("自由項目：サンプル修繕費");
    expect(s.history[0].after).toMatchObject({
      customCategory: "サンプル修繕費",
    });
  });
  it("レシート金額は出金を二重計上せず、修正前後を保持", () => {
    const s = saveCash(
        fresh(),
        session,
        cash({
          category: "支払い",
          receiptAmount: 3000,
          receiptDescription: "架空のレシート内容",
        }),
        undefined,
        now,
      ),
      m = s.movements[0];
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(27000);
    expect(ledger(s, "honten")).toHaveLength(1);
    const next = saveCash(
      s,
      session,
      { ...m, receiptAmount: 3200, receiptDescription: "架空の修正後" },
      { id: m.id, revision: m.revision },
      now,
    );
    expect(balanceAt(next, "honten", "2026-10-01")).toBe(27000);
    expect(next.history[0].before).toMatchObject({ receiptAmount: 3000 });
    expect(next.history[0].after).toMatchObject({ receiptAmount: 3200 });
  });
  it("レシートの片方のみ、負数、小数の金額を拒否", () => {
    for (const fields of [
      { receiptAmount: 100 },
      { receiptDescription: "摘要だけ" },
      { receiptAmount: -1, receiptDescription: "摘要" },
      { receiptAmount: 1.2, receiptDescription: "摘要" },
    ])
      expect(() =>
        saveCash(fresh(), session, cash(fields), undefined, now),
      ).toThrow();
  });
  it("割引券は枚数と額を保持し、現金・売上に再計上しない", () => {
    const input = {
      storeId: "honten" as const,
      date: "2026-10-01",
      businessStatus: "営業" as const,
      cashSales: 20000,
      cashlessSales: 30000,
      laborMinutes: 1200,
      memo: "架空の記録",
      countedCash: null,
      voucherCount: 3,
      voucherDiscount: 1500,
    };
    const s = saveDaily(fresh(), session, input, undefined, now);
    expect(s.reports[0].voucherCount).toBe(3);
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(50000);
    expect(monthlySummary(s, ["honten"], "2026-10", now).current.sales).toBe(
      50000,
    );
    expect(() =>
      saveDaily(
        fresh(),
        session,
        { ...input, voucherCount: 0 },
        undefined,
        now,
      ),
    ).toThrow("1枚以上");
    expect(() =>
      saveDaily(
        fresh(),
        session,
        { ...input, voucherDiscount: undefined },
        undefined,
        now,
      ),
    ).toThrow("両方");
  });
  it("旧保存データの未記録を維持し、旧仕入区分も読み込む", () => {
    const s = createFinanceSeed(now);
    expect(s.reports[0].voucherCount).toBeUndefined();
    expect(financeSchema.safeParse(s).success).toBe(true);
    const next = saveCash(
      s,
      session,
      cash({ category: "仕入" }),
      undefined,
      now,
    );
    expect(financeSchema.safeParse(next).success).toBe(true);
    expect(cashCategoryLabel(next.movements.at(-1)!)).toBe("仕入れ");
  });
});
