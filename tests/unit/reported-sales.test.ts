import { describe, expect, it } from "vitest";
import { reportedSalesSchema } from "../../src/lib/reported-sales";
const sample = {
  month: "2026-10",
  as_of_sales_date: "2026-10-22",
  stores: [
    { store_id: "honten", sales_jpy: 100000 },
    { store_id: "816", sales_jpy: 200000 },
  ],
};
describe("提供された月累計の表示", () => {
  it("正しい基準日と両店舗の累計を受け取り、未確認の補助情報を公開データへ含めない", () => {
    expect(
      reportedSalesSchema.parse({
        ...sample,
        source_sheet_url: "private-source",
        internal_note: "private-note",
      }),
    ).toEqual(sample);
  });
  it("片方だけのデータや店舗重複から全社合計を作らない", () => {
    expect(
      reportedSalesSchema.safeParse({ ...sample, stores: [sample.stores[0]] })
        .success,
    ).toBe(false);
    expect(
      reportedSalesSchema.safeParse({
        ...sample,
        stores: [sample.stores[0], sample.stores[0]],
      }).success,
    ).toBe(false);
  });
  it("基準日の欠落・不正日付・月違いを拒否する", () => {
    for (const date of ["2026-02-30", "2026-11-01", "2026-10-99", ""])
      expect(
        reportedSalesSchema.safeParse({ ...sample, as_of_sales_date: date })
          .success,
      ).toBe(false);
  });
  it("負数・小数・不明な店舗を拒否し、明示された0円を保持する", () => {
    for (const entry of [
      { store_id: "unknown", sales_jpy: 100 },
      { store_id: "honten", sales_jpy: -1 },
      { store_id: "honten", sales_jpy: 1.2 },
    ])
      expect(
        reportedSalesSchema.safeParse({
          ...sample,
          stores: [entry, sample.stores[1]],
        }).success,
      ).toBe(false);
    expect(
      reportedSalesSchema.parse({
        ...sample,
        stores: [{ store_id: "honten", sales_jpy: 0 }, sample.stores[1]],
      }).stores[0].sales_jpy,
    ).toBe(0);
  });
});
