import { expect, test } from "@playwright/test";
import { IMPORTED_SALES_KEY } from "../../src/lib/imported-sales";
import { parseShiftCsv } from "../../src/lib/shifts";

const value = (sales: number | null, cumulative: number) => ({
  sales,
  cumulative,
  reportedYoy: 120,
});
const sales = {
  version: 1,
  source: "架空の取込検証用",
  asOf: "2026-10-02",
  rows: [
    { date: "2026-10-01", honten: value(1000, 1000), "816": value(2000, 2000) },
    { date: "2026-10-02", honten: value(null, 1000), "816": value(3000, 5000) },
  ],
};
test("紙のシフトを転記し、CSVを保存し、再読込して同じ勤務予定を表示できる", async ({
  page,
}) => {
  await page.goto("/shifts");
  await page.getByText("紙のシフトを入力する", { exact: false }).click();
  const form = page.locator(".shift-manual");
  await form.getByLabel("勤務日", { exact: true }).fill("2026-10-25");
  await form.getByLabel("スタッフ表示名").fill("入力確認スタッフ");
  await form.getByLabel("勤務開始").fill("10:00");
  await form.getByLabel("勤務終了（翌日は25:00など）").fill("16:00");
  await form.getByLabel("休憩（分）").fill("30");
  await form
    .getByRole("button", { name: "勤務予定を追加", exact: true })
    .click();
  await expect(page.locator(".shift-timeline")).toContainText(
    "入力確認スタッフ",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "表示中の予定をCSV保存", exact: true })
      .click(),
  ]);
  const stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(parseShiftCsv(csv)[0]).toMatchObject({
    label: "入力確認スタッフ",
    start: 600,
    end: 960,
    breakMinutes: 30,
  });
  await page.reload();
  await expect(page.locator(".shift-timeline")).toHaveCount(0);
  await page
    .getByLabel("シフトCSVを読み込む")
    .setInputFiles({
      name: "backup.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator(".shift-timeline")).toContainText(
    "入力確認スタッフ",
  );
});

test("本店ゴミ出しボタンから照合用日程と前日通知時刻を確認でき、稼働中と誤認させない", async ({
  page,
}) => {
  await page.goto("/daily");
  await page.getByRole("link", { name: "本店ゴミ出し", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本店のゴミ出し", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("自動通知は未稼働", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".garbage-events > li")).toHaveCount(6);
  await expect(page.locator(".garbage-events")).toContainText("2026-11-05");
  await expect(page.locator(".garbage-events")).toContainText("17:00 / 19:00");
  await expect(
    page.getByRole("link", { name: "阿南市の公式予定表を確認" }),
  ).toHaveAttribute(
    "href",
    "https://www.city.anan.tokushima.jp/docs/2025071000030/",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("売上ファイルを照合し、保存操作で端末内に保持し、出納帳サンプルへ加算しない", async ({
  page,
}) => {
  await page.goto("/daily");
  const before = await page.evaluate(() =>
    localStorage.getItem("wuto-wurk-finance-demo-v1"),
  );
  await page.getByLabel("売上ファイルを読み込む（JSON）").setInputFiles({
    name: "sales.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(sales)),
  });
  await expect(page.getByTestId("imported-sales-total")).toHaveText("￥1,000");
  await expect(page.getByText("ポータル未反映", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".local-table")).toContainText("未入力");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), IMPORTED_SALES_KEY),
  ).toBeNull();
  await page
    .getByRole("button", { name: "この端末に保存", exact: true })
    .click();
  await page.reload();
  await expect(page.getByTestId("imported-sales-total")).toHaveText("￥1,000");
  await page.getByLabel("表示する店舗").selectOption("all");
  await expect(page.getByTestId("imported-sales-total")).toHaveText("￥6,000");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wuto-wurk-finance-demo-v1"),
    ),
  ).toBe(before);
  const invalid = structuredClone(sales);
  invalid.rows[1].honten.cumulative = 9999;
  await page.getByLabel("売上ファイルを読み込む（JSON）").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(
    page.locator(".imported-sales").getByRole("alert"),
  ).toContainText("一致しません");
  await expect(page.getByTestId("imported-sales-total")).toHaveText("￥6,000");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("店舗別のシフトを可視化し、未接続のAirシフトを同期済みと表示せず、個人データを保存しない", async ({
  page,
}) => {
  await page.goto("/shifts");
  await expect(
    page.getByRole("heading", { name: "チームのシフト" }),
  ).toBeVisible();
  await expect(
    page.getByText("Airシフト未接続", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Airシフトを開く" }),
  ).toHaveAttribute("href", "https://airshift.jp/sft/monthlyshift");
  await page.getByLabel("表示する店舗").selectOption("all");
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  const csv =
    "店舗,日付,表示名,開始,終了,休憩分\n本店,2026-10-25,スタッフA,10:00,16:00,30\n羽ノ浦店,2026-10-25,スタッフB,17:00,25:00,60\n";
  await page.getByLabel("シフトCSVを読み込む").setInputFiles({
    name: "shift.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.locator(".shift-timeline")).toContainText("スタッフA");
  await expect(page.locator(".shift-timeline")).toContainText("スタッフB");
  await expect(page.locator(".shift-timeline")).toContainText("翌01:00");
  await expect(page.locator(".local-kpis")).toContainText("12.5");
  await page.getByLabel("表示する店舗").selectOption("816");
  await expect(page.locator(".shift-timeline")).not.toContainText("スタッフA");
  await expect(page.locator(".shift-timeline")).toContainText("スタッフB");
  await page
    .getByRole("button", { name: "2026-10-26 未登録", exact: true })
    .click();
  await expect(page.locator(".shift-empty")).toContainText("未登録");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const after = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  for (const [key, val] of Object.entries(after)) {
    if (key !== "wuto-wurk-prototype-v1") expect(val).toBe(before[key]);
    expect(val).not.toContain("スタッフB");
  }
  expect(await page.evaluate(() => location.href)).not.toContain("スタッフB");
  await page.reload();
  await expect(page.locator(".shift-timeline")).toHaveCount(0);
  await expect(
    page.getByText("勤務予定は未取込です。人数・労働時間は未確定です。", {
      exact: true,
    }),
  ).toBeVisible();
});
