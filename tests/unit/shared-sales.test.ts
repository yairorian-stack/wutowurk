import { describe, it, expect } from "vitest";
import { sharedSalesFromRows } from "../../src/lib/shared-sales";
import { salesMonthSummary } from "../../src/lib/imported-sales";
const header = { source: "架空の共有売上テスト", as_of: "2026-10-02" };
const rows = [
  { store_id: "honten", sales_date: "2026-10-01", sales_jpy: 1500, cumulative_jpy: 1500, reported_yoy: 110 },
  { store_id: "honten", sales_date: "2026-10-02", sales_jpy: null, cumulative_jpy: 1500, reported_yoy: 90 },
  { store_id: "816", sales_date: "2026-10-01", sales_jpy: 600, cumulative_jpy: 600, reported_yoy: 100 },
  { store_id: "816", sales_date: "2026-10-02", sales_jpy: 400, cumulative_jpy: 1000, reported_yoy: 120 },
];
describe("共有売上の表示モデル", () => {
  it("RLSで取得できた店舗だけを変換し、非表示店舗は0円で補完しない", () => {
    const data = sharedSalesFromRows(header, rows.filter(r => r.store_id === "honten"));
    expect(data.rows[0]["816"].sales).toBeNull();
    expect(salesMonthSummary(data, "2026-10", "honten")).toMatchObject({ total: 1500, missing: 1, reportedYoy: 90 });
    expect(salesMonthSummary(data, "2026-10", "816").entered).toBe(0);
  });
  it("全店合計は日別実績から算出し、前年比の平均を作らない", () => {
    expect(salesMonthSummary(sharedSalesFromRows(header, rows), "2026-10", "all")).toMatchObject({ total: 2500, reportedYoy: null });
  });
  it("不整合・重複・不正日付・基準日後の行を拒否し、黙って修正しない", () => {
    expect(() => sharedSalesFromRows(header, [...rows, rows[0]])).toThrow("重複");
    expect(() => sharedSalesFromRows(header, [{ ...rows[0], cumulative_jpy: 1501 }])).toThrow("一致しません");
    expect(() => sharedSalesFromRows(header, [{ ...rows[0], sales_date: "2026-10-03" }])).toThrow("基準日後");
    expect(() => sharedSalesFromRows(header, [{ ...rows[0], sales_date: "2026-09-31" }])).toThrow();
  });
});
