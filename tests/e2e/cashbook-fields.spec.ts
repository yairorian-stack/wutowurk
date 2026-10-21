import { expect, test } from "@playwright/test";
import { today } from "../../src/lib/domain";
import { monthShift, yen } from "../../src/lib/finance";
import { readFile } from "node:fs/promises";

test("仕入れ・寄付・支払い・自由項目とレシート金額摘要を保存する", async ({
  page,
}) => {
  const month = monthShift(today().slice(0, 7), -1);
  await page.goto("/daily");
  await page.getByLabel("集計する月").fill(month);
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await page.getByRole("button", { name: "入出金を記録" }).click();
  const category = page.getByLabel("現金明細の区分");
  for (const value of ["仕入れ", "寄付", "支払い", "自由項目"])
    await category.selectOption(value);
  await page.getByLabel("自由項目の名称").fill("サンプル修繕費");
  await page.getByLabel("現金明細の金額").fill("3000");
  await page.getByLabel("摘要", { exact: true }).fill("架空の追加項目テスト");
  await page.getByLabel("レシート金額", { exact: true }).fill("3000");
  await page
    .getByLabel("レシートの摘要", { exact: true })
    .fill("架空のレシート記録");
  await page.getByRole("button", { name: "現金明細を保存" }).click();
  await expect(page.locator(".cash-summary>div").last()).toContainText(
    yen(47000),
  );
  const row = page.getByRole("row").filter({ hasText: "架空の追加項目テスト" });
  await expect(row).toContainText("自由項目：サンプル修繕費");
  await row.locator(".receipt-meta summary").click();
  await expect(row).toContainText("架空のレシート記録");
  await page.reload();
  await page.getByLabel("集計する月").fill(month);
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "架空の追加項目テスト" }),
  ).toContainText("自由項目：サンプル修繕費");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV保存", exact: true }).click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("レシート金額（参考円）");
  expect(csv).toContain("架空のレシート記録");
});

test("割引券の枚数・割引額を出納帳から記録し、現金と売上を減らさない", async ({
  page,
}) => {
  await page.goto("/daily");
  const beforeSales = (await page.locator(".finance-kpi").first().textContent())!;
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  const beforeBalance = (await page
    .locator(".cash-summary>div")
    .last()
    .textContent())!;
  await page.getByRole("button", { name: "割引券を記録", exact: true }).click();
  await page.getByLabel("割引券の使用枚数").fill("3");
  await page.getByLabel("割引券の割引額").fill("1500");
  await page.getByRole("button", { name: "日報を保存", exact: true }).click();
  await expect(page.locator(".voucher-summary")).toContainText("3");
  await expect(page.locator(".voucher-summary")).toContainText(yen(1500));
  await expect(page.locator(".cash-summary>div").last()).toHaveText(
    beforeBalance,
  );
  await page
    .getByRole("tab", { name: "月次進捗・前年比", exact: true })
    .click();
  await expect(page.locator(".finance-kpi").first()).toHaveText(beforeSales);
  await page.reload();
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await expect(page.locator(".voucher-table")).toContainText("3枚");
  await expect(page.locator(".voucher-table")).toContainText(yen(1500));
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
