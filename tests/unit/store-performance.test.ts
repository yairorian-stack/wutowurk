import { describe, expect, it } from "vitest";
import { canonicalSalesFromRows } from "../../src/lib/shared-sales";
import { storePerformance } from "../../src/lib/store-performance";

const sale = (date: string, sales: number, labor: number | null, yoy: number | null = null, store = "honten") =>
  ({ store_id: store, sales_date: date, sales_jpy: sales, labor_minutes: labor, reported_yoy: yoy });

describe("店舗別の月累計前年比・今週の人時売上高", () => {
  it("前年同期間の累計比率は直近実績日の値を使い、日別比率を平均しない", () => {
    const data = canonicalSalesFromRows([sale("2026-10-26", 12000, 60, 120), sale("2026-10-27", 6000, 180, 90)]);
    expect(storePerformance(data, "honten", "2026-10-28")).toMatchObject({
      monthSales: 18000, monthThrough: "2026-10-27", yoy: 90,
      salesPerLaborHour: 4500, laborMinutes: 240, sales: 18000,
    });
  });
  it("売上や労時の空欄・売上あり労時0は不足として扱い、0円や極端な人時を出さない", () => {
    for (const labor of [null, 0]) {
      const data = canonicalSalesFromRows([sale("2026-10-26", 12000, labor)]);
      expect(storePerformance(data, "honten", "2026-10-28")).toMatchObject({ missingSales: 1, missingLabor: 1, salesPerLaborHour: null });
    }
    const data = canonicalSalesFromRows([sale("2026-10-26", 0, 60), sale("2026-10-27", 0, 0)]);
    expect(storePerformance(data, "honten", "2026-10-28").salesPerLaborHour).toBe(0);
  });
  it("手入力の訂正を含む月は元シートの比率を転用せず、店舗と月の範囲を守る", () => {
    const data = canonicalSalesFromRows([sale("2026-09-30", 999, 60, 50), sale("2026-10-26", 1000, 60, 110), sale("2026-10-26", 9999, 60, 90, "816")]);
    expect(storePerformance(data, "honten", "2026-10-27", ["2026-10-01"])).toMatchObject({ monthSales: 1000, yoy: null, overridden: true });
    expect(storePerformance(data, "honten", "2026-10-27", ["2026-09-30"]).yoy).toBe(110);
    expect(storePerformance(data, "816", "2026-11-01").monthSales).toBeNull();
  });
  it("月またぎの週を月曜日から集計し、当日実績があれば含める", () => {
    const data = canonicalSalesFromRows([sale("2026-11-30", 1000, 60), sale("2026-12-01", 2000, 60)]);
    expect(storePerformance(data, "honten", "2026-12-01")).toMatchObject({ monthSales: 2000, weekStart: "2026-11-30", weekThrough: "2026-12-01", salesPerLaborHour: 1500 });
  });
  it("前年の旧データ・未来の行・他店舗だけから現在月の数値を補わない", () => {
    const data = canonicalSalesFromRows([sale("2026-10-01", 1000, 60, 110, "816"), sale("2026-11-01", 2000, 60, 120)]);
    expect(storePerformance(data, "honten", "2026-10-30")).toMatchObject({ monthSales: null, yoy: null, salesPerLaborHour: null });
  });
});
