import { describe, expect, it } from "vitest";
import {
  parseImportedSales,
  salesMonthSummary,
} from "../../src/lib/imported-sales";
const a = (
  sales: number | null,
  cumulative: number | null,
  reportedYoy = 110,
) => ({ sales, cumulative, reportedYoy });
const sample = () => ({
  version: 1,
  source: "架空の照合用データ",
  asOf: "2026-10-03",
  rows: [
    { date: "2026-09-30", honten: a(2000, 2000), "816": a(1000, 1000) },
    { date: "2026-10-01", honten: a(1000, 1000), "816": a(600, 600) },
    { date: "2026-10-02", honten: a(null, 1000), "816": a(0, 600) },
    { date: "2026-10-03", honten: a(800, 1800), "816": a(null, 600) },
    { date: "2026-10-04", honten: a(null, 1800, 90), "816": a(null, 600, 90) },
  ],
});
describe("提供された日別売上の照合", () => {
  it("月初リセット・空欄と明示0円・集計基準日を区別する", () => {
    const data = parseImportedSales(JSON.stringify(sample()));
    expect(salesMonthSummary(data, "2026-10", "honten")).toMatchObject({
      total: 1800,
      entered: 2,
      missing: 1,
      lastDate: "2026-10-03",
      reportedYoy: 110,
    });
    expect(salesMonthSummary(data, "2026-10", "816")).toMatchObject({
      total: 600,
      entered: 2,
      missing: 1,
    });
    expect(salesMonthSummary(data, "2026-10", "all")).toMatchObject({
      total: 2400,
      reportedYoy: null,
    });
    expect(data.rows[1].honten.sales).toBe(1000);
    expect(data.rows[2].honten.sales).toBeNull();
    expect(data.rows[2]["816"].sales).toBe(0);
  });
  it("累計の不一致を拒否し、黙って補正しない", () => {
    const data = sample();
    data.rows[3].honten.cumulative = 1801;
    expect(() => parseImportedSales(JSON.stringify(data))).toThrow(
      "一致しません",
    );
  });
  it("重複日・不正日付・負数・基準日後の実績を拒否する", () => {
    const duplicate = sample();
    duplicate.rows.push(duplicate.rows[0]);
    expect(() => parseImportedSales(JSON.stringify(duplicate))).toThrow("重複");
    const invalid = sample();
    invalid.rows[0].date = "2026-09-31";
    expect(() => parseImportedSales(JSON.stringify(invalid))).toThrow();
    const negative = sample();
    negative.rows[1].honten.sales = -1;
    expect(() => parseImportedSales(JSON.stringify(negative))).toThrow();
    const future = sample();
    future.rows[4].honten = a(100, 1900);
    expect(() => parseImportedSales(JSON.stringify(future))).toThrow(
      "基準日より後",
    );
  });
  it("未知の補助情報・私的URLを保存用データへ含めない", () => {
    const value = { ...sample(), url: "private", secret: "not-for-output" };
    const parsed = parseImportedSales(JSON.stringify(value));
    expect(JSON.stringify(parsed)).not.toContain("private");
    expect(() => parseImportedSales("invalid-json")).toThrow("JSON");
  });
});
