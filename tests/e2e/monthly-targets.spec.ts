import { expect, test, type Page } from "@playwright/test";
import { today } from "../../src/lib/domain";
import { monthShift, yen } from "../../src/lib/finance";

async function setTarget(page: Page, sales: string, productivity: string) {
  await page.getByLabel("月間売上目標", { exact: true }).fill(sales);
  await page.getByLabel("人時売上高目標", { exact: true }).fill(productivity);
  await page
    .getByRole("button", { name: "月次目標を保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function fillDaily(page: Page, date: string) {
  await page.getByRole("button", { name: "日報を入力", exact: true }).click();
  await page.getByLabel("日報の営業日").fill(date);
  await page.getByLabel("現金売上（税込・円）", { exact: true }).fill("20000");
  await page
    .getByLabel("キャッシュレス売上（税込・円）", { exact: true })
    .fill("30000");
  await page.getByLabel("総労働時間の時間", { exact: true }).fill("10");
}

test("日報1回で現金明細・売上・月次目標・人時を反映し、訂正しても重複しない", async ({
  page,
}) => {
  const month = monthShift(today().slice(0, 7), -1),
    date = `${month}-01`;
  await page.goto("/daily");
  await page.getByLabel("集計する月").fill(month);
  await page
    .getByRole("button", { name: "月次目標を設定", exact: true })
    .click();
  await setTarget(page, "100000", "5000");
  await fillDaily(page, date);
  await expect(page.locator(".daily-productivity-preview")).toContainText(
    yen(5000),
  );
  await page.locator(".daily-cash-fields > summary").click();
  await page
    .getByRole("button", { name: "現金明細を追加", exact: true })
    .click();
  await page.getByLabel("日報の現金明細1の金額", { exact: true }).fill("3000");
  await page
    .getByLabel("日報の現金明細1の摘要", { exact: true })
    .fill("架空の一括入力仕入れ");
  await page.locator(".daily-receipt-fields > summary").click();
  await page
    .getByLabel("日報の現金明細1のレシート金額", { exact: true })
    .fill("3000");
  await page
    .getByLabel("日報の現金明細1のレシート摘要", { exact: true })
    .fill("架空の一括入力レシート");
  await page.getByRole("button", { name: "日報を保存", exact: true }).click();
  const sales = page.getByRole("article", { name: "月間売上", exact: true });
  const productivity = page.getByRole("article", {
    name: "人時売上高",
    exact: true,
  });
  await expect(sales).toContainText(yen(50000));
  await expect(sales.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "50%",
  );
  await expect(productivity.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "100%",
  );
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await expect(page.locator(".cash-summary>div").last()).toContainText(
    yen(67000),
  );
  await expect(
    page.getByRole("row").filter({ hasText: "架空の一括入力仕入れ" }),
  ).toHaveCount(1);
  await page
    .getByRole("row")
    .filter({ hasText: date })
    .filter({ hasText: "現金売上" })
    .getByRole("button")
    .click();
  await page.locator(".daily-cash-fields > summary").click();
  await page.getByLabel("日報の現金明細1の金額", { exact: true }).fill("4000");
  await page.getByRole("button", { name: "日報を保存", exact: true }).click();
  await expect(page.locator(".cash-summary>div").last()).toContainText(
    yen(66000),
  );
  await expect(
    page.getByRole("row").filter({ hasText: "架空の一括入力仕入れ" }),
  ).toHaveCount(1);
  await page.reload();
  await page.getByLabel("集計する月").fill(month);
  await expect(sales.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "50%",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("前月目標をコピーし、店舗別と全社の目標を分け、変更履歴を保存する", async ({
  page,
}) => {
  const month = today().slice(0, 7),
    prior = monthShift(month, -1);
  await page.goto("/daily");
  await page.getByLabel("集計する月").fill(prior);
  await page
    .getByRole("button", { name: "月次目標を設定", exact: true })
    .click();
  await setTarget(page, "100000", "5000");
  await page.getByLabel("集計する月").fill(month);
  await page
    .getByRole("button", { name: "月次目標を設定", exact: true })
    .click();
  await page
    .getByRole("button", { name: "前月の目標をコピー", exact: true })
    .click();
  await expect(page.getByLabel("月間売上目標", { exact: true })).toHaveValue(
    "100000",
  );
  await expect(page.getByLabel("人時売上高目標", { exact: true })).toHaveValue(
    "5000",
  );
  await page
    .getByRole("button", { name: "月次目標を保存", exact: true })
    .click();
  await page.getByLabel("表示する店舗").selectOption("all");
  await expect(page.locator(".monthly-target-empty")).toContainText(
    "全店舗の目標が揃うと",
  );
  await expect(page.locator(".monthly-target-metric")).toHaveCount(0);
  await page
    .getByRole("button", { name: "羽ノ浦店の目標を設定", exact: true })
    .click();
  await setTarget(page, "300000", "10000");
  await expect(
    page.getByRole("article", { name: "月間売上", exact: true }),
  ).toContainText(yen(400000));
  await expect(
    page.getByRole("article", { name: "人時売上高", exact: true }),
  ).toContainText(yen(8000));
  await page
    .getByRole("button", { name: "本店の目標を編集", exact: true })
    .click();
  await setTarget(page, "200000", "5000");
  await page
    .getByRole("button", { name: "記録の変更履歴", exact: true })
    .click();
  const latest = page.locator(".audit-list article").first();
  await expect(latest).toContainText("月次目標を更新");
  await latest.getByText("変更前後を見る", { exact: true }).click();
  await expect(latest.locator(".finance-audit-pair>div").first()).toContainText(
    yen(100000),
  );
  await expect(latest.locator(".finance-audit-pair>div").last()).toContainText(
    yen(200000),
  );
});

test("保存領域のエラーでは日報や明細を保存済みにせず、部分反映しない", async ({
  page,
}) => {
  const month = monthShift(today().slice(0, 7), -1),
    date = `${month}-01`;
  await page.goto("/daily");
  const before = await page.evaluate(() =>
    localStorage.getItem("wuto-wurk-finance-demo-v1"),
  );
  await fillDaily(page, date);
  await page.locator(".daily-cash-fields > summary").click();
  await page
    .getByRole("button", { name: "現金明細を追加", exact: true })
    .click();
  await page.getByLabel("日報の現金明細1の金額", { exact: true }).fill("3000");
  await page
    .getByLabel("日報の現金明細1の摘要", { exact: true })
    .fill("保存失敗時の架空データ");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "wuto-wurk-finance-demo-v1")
        throw new DOMException("No space", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "日報を保存", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "保存できません",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wuto-wurk-finance-demo-v1"),
    ),
  ).toBe(before);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByLabel("集計する月").fill(month);
  await expect(page.locator(".finance-kpi").first()).toContainText(yen(0));
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "保存失敗時の架空データ" }),
  ).toHaveCount(0);
});
