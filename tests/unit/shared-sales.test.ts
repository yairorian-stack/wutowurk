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

import { canonicalSalesFromRows, sharedCashFromRows } from "../../src/lib/shared-sales";
describe("日次更新用の表示モデル",()=>{
  it("店舗日をまとめて月累計を計算し、月替わりでリセットする",()=>{
    const data=canonicalSalesFromRows([
      {store_id:"honten",sales_date:"2026-10-31",sales_jpy:1500,reported_yoy:null},
      {store_id:"honten",sales_date:"2026-11-01",sales_jpy:600,reported_yoy:null},
    ]);
    expect(data.rows.map(r=>r.honten.cumulative)).toEqual([1500,600]);
    expect(data.rows[0]["816"].sales).toBeNull();
  });
  it("同じ店舗日の重複を合算せず拒否する",()=>{
    const row={store_id:"honten",sales_date:"2026-10-01",sales_jpy:1500,reported_yoy:null};
    expect(()=>canonicalSalesFromRows([row,row])).toThrow("重複");
  });
  it("出納帳の残高と順序が不正なら表示モデルを作らない",()=>{
    const header={month:"2026-10-01",opening_jpy:1000};
    const row={transaction_date:"2026-10-01",source_order:5,category:"売上",description:"架空",receipt_jpy:1500,payment_jpy:0,balance_jpy:2500};
    expect(sharedCashFromRows(header,[row]).rows).toHaveLength(1);
    expect(()=>sharedCashFromRows(header,[{...row,balance_jpy:2501}])).toThrow("残高");
    expect(()=>sharedCashFromRows(header,[row,row])).toThrow();
  });
});
