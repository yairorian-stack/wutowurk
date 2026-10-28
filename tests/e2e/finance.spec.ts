import { expect } from "@playwright/test";
import { test } from "./finance-fixture";
import { readFile } from "node:fs/promises";
import { today } from "../../src/lib/domain";
import { createFinanceSeed, monthShift, yen } from "../../src/lib/finance";

test("日報の登録・労働時間・月次反映・編集・再読込・変更履歴", async ({
  page,
}) => {
  const month = monthShift(today().slice(0, 7), -1),
    date = `${month}-01`;
  await page.goto("/daily");
  await page.getByRole("button", { name: "日報を入力", exact: true }).click();
  await page.getByLabel("日報の営業日").fill(date);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("現金売上（税込・円）", { exact: true })
    .fill("10000");
  await dialog
    .getByLabel("キャッシュレス売上（税込・円）", { exact: true })
    .fill("20000");
  await dialog.getByLabel("総労働時間の時間", { exact: true }).fill("25");
  await dialog.getByLabel("総労働時間の分", { exact: true }).fill("30");
  await dialog.getByLabel("1日のメモ・振り返り").fill("架空のチーム共有メモ");
  await dialog.getByText("閉店時の現金を確認する（任意）").click();
  await dialog.getByLabel("実際に数えた店舗現金の残高（円）").fill("40000");
  await dialog.getByRole("button", { name: "日報を保存" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("集計する月").fill(month);
  await expect(page.locator(".finance-kpi").first()).toContainText(yen(30000));
  await expect(page.locator(".finance-kpi").nth(1)).toContainText("25時間30分");
  await page.getByRole("tab", { name: "日報一覧" }).click();
  await page.getByRole("button", { name: `${date} 本店の日報を編集` }).click();
  await page.getByLabel("現金売上（税込・円）", { exact: true }).fill("15000");
  await page.getByRole("button", { name: "日報を保存" }).click();
  await page.reload();
  await page.getByLabel("集計する月").fill(month);
  await page.getByRole("tab", { name: "日報一覧" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "架空のチーム共有メモ" }),
  ).toContainText(yen(35000));
  await expect(
    page.getByRole("row").filter({ hasText: "架空のチーム共有メモ" }),
  ).toContainText(yen(-25000));
  await page.getByRole("button", { name: "記録の変更履歴" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /日報を更新/ }),
  ).toBeVisible();
  await page.getByRole("dialog").getByText("変更前後を見る").first().click();
  const changes = page
    .getByRole("dialog")
    .locator(".audit-list article")
    .first()
    .locator(".finance-audit-pair");
  await expect(
    changes.locator(":scope>div").nth(0).getByText(yen(10000), { exact: true }),
  ).toBeVisible();
  await expect(
    changes.locator(":scope>div").nth(1).getByText(yen(15000), { exact: true }),
  ).toBeVisible();
});

test("現金売上は1回だけ自動反映し、キャッシュレスを現金入金に含めない", async ({
  page,
}) => {
  await page.goto("/daily");
  await page.getByRole("button", { name: "日報を入力", exact: true }).click();
  await page.getByLabel("営業状況", { exact: true }).selectOption("営業");
  await page.getByLabel("現金売上（税込・円）", { exact: true }).fill("11111");
  await page
    .getByLabel("キャッシュレス売上（税込・円）", { exact: true })
    .fill("22222");
  await page.getByRole("button", { name: "日報を保存" }).click();
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: today() })
    .filter({ hasText: "現金売上" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(yen(11111));
  await expect(row).not.toContainText(yen(33333));
  await row.getByRole("button", { name: /日報から自動反映を編集/ }).click();
  await page.getByLabel("現金売上（税込・円）", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "日報を保存" }).click();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(yen(12345));
});

test("現金の支出・残高・取消理由・取消履歴", async ({ page }) => {
  const month = monthShift(today().slice(0, 7), -1);
  await page.goto("/daily");
  await page.getByLabel("集計する月").fill(month);
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await page.getByRole("button", { name: "入出金を記録" }).click();
  await page.getByLabel("現金明細の金額").fill("3000");
  await page.getByLabel("摘要", { exact: true }).fill("架空の比較用仕入");
  await page.getByRole("button", { name: "現金明細を保存" }).click();
  await expect(page.locator(".cash-summary>div").last()).toContainText(
    yen(47000),
  );
  await page.getByRole("button", { name: /架空の比較用仕入を取消/ }).click();
  await page.getByLabel("取消理由").fill("架空の重複記入のため");
  await page.getByRole("button", { name: "理由を記録して取消" }).click();
  await expect(page.locator(".cash-summary>div").last()).toContainText(
    yen(50000),
  );
  await page.getByRole("button", { name: /取消済みの明細/ }).click();
  await expect(page.locator(".cancelled-list")).toContainText(
    "架空の重複記入のため",
  );
  await page.getByRole("button", { name: "記録の変更履歴" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /現金明細を取消/ }),
  ).toBeVisible();
});

test("未入力を0として前年比を表示しない", async ({ page }) => {
  const state = createFinanceSeed();
  state.reports = state.reports.filter(
    (r) => !(r.storeId === "honten" && r.date === `${today().slice(0, 7)}-01`),
  );
  await page.addInitScript(
    (data) =>
      localStorage.setItem("wuto-wurk-finance-demo-v1", JSON.stringify(data)),
    state,
  );
  await page.goto("/daily");
  await expect(
    page.getByText("未入力を0として比較しません", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".finance-yoy").first()).toContainText(
    "前年比未算出",
  );
  await page.getByText("未入力日を確認", { exact: true }).click();
  await expect(page.locator(".comparison-readiness details")).toContainText(
    `${today().slice(0, 7)}-01`,
  );
});

test("一般スタッフを制限し、店舗管理者は自店舗だけ、全社は2店舗を集計", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("staff");
  await page.goto("/daily");
  await expect(
    page.getByText("店舗管理者以上のプレビューで利用できます。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("manager");
  await page.getByLabel("所属店舗", { exact: true }).selectOption("816");
  await page.goto("/daily");
  await expect(page.locator(".finance-store-card")).toHaveCount(1);
  await expect(page.locator(".finance-store-card")).toContainText("羽ノ浦店");
  await expect(page.getByLabel("表示する店舗")).toHaveCount(0);
  await page.getByRole("tab", { name: "日報一覧" }).click();
  await expect(page.locator(".finance-table tbody")).not.toContainText("本店");
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("company");
  await page.goto("/daily");
  await page.getByLabel("表示する店舗").selectOption("all");
  await expect(page.locator(".finance-store-card")).toHaveCount(2);
  await page.getByRole("tab", { name: "現金出納帳", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "出納帳は店舗ごとに管理します" }),
  ).toBeVisible();
});

test("日報CSVを保存でき、月次画面と出納帳は320pxでも横にはみ出さない", async ({
  page,
}) => {
  await page.goto("/daily");
  await page.getByRole("tab", { name: "日報一覧" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV保存", exact: true }).click(),
  ]);
  const path = await download.path();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain("総労働時間（分）");
  expect(csv).toContain("本店");
  expect(csv).not.toContain("羽ノ浦店");
  await page.setViewportSize({ width: 320, height: 900 });
  for (const name of ["月次進捗・前年比", "日報一覧", "現金出納帳"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      name,
    ).toBe(true);
  }
});
