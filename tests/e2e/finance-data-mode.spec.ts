import { expect, test } from "@playwright/test";
import { createFinanceSeed } from "../../src/lib/finance";
import { createSeed } from "../../src/lib/seed";
import { REPORTED_SALES_ELEMENT_ID } from "../../src/lib/reported-sales";

test("提供済み月累計を店舗別・全社で表示し、日報や現金残高を捏造しない", async ({
  page,
}) => {
  const data = {
    month: "2026-10",
    as_of_sales_date: "2026-10-22",
    stores: [
      { store_id: "honten", sales_jpy: 100000 },
      { store_id: "816", sales_jpy: 200000 },
    ],
  };
  await page.route("**/daily", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "</head>",
      `<script id="${REPORTED_SALES_ELEMENT_ID}" type="application/json">${JSON.stringify(data)}</script></head>`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/daily");
  await expect(page.getByText("ご提示の月累計", { exact: true })).toBeVisible();
  await expect(page.locator(".reported-sales-amount")).toContainText("100,000");
  await expect(page.locator(".finance-not-connected")).toContainText(
    "2026-10-22",
  );
  await expect(page.locator(".finance-unavailable-values")).toContainText(
    "未取込",
  );
  await expect(page.locator(".finance-unavailable-values")).toContainText(
    "未照合",
  );
  await page.getByLabel("表示する店舗").selectOption("all");
  await expect(page.locator(".reported-sales-amount")).toContainText("300,000");
  await page.getByLabel("表示する店舗").selectOption("816");
  await expect(page.locator(".reported-sales-amount")).toContainText("200,000");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wuto-wurk-finance-demo-v1"),
    ),
  ).toBeNull();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("ポータル未反映時は架空の累計や0円を実績として表示しない", async ({
  page,
}) => {
  await page.goto("/daily");
  await expect(page.getByText("ポータル未反映", { exact: true })).toBeVisible();
  await expect(page.locator(".finance-unavailable-values")).toContainText(
    "未反映",
  );
  await expect(page.locator(".finance-unavailable-values")).not.toContainText(
    /[￥¥]/,
  );
  await expect(page.locator(".finance-kpi")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wuto-wurk-finance-demo-v1"),
    ),
  ).toBeNull();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("保存済みデータを消さず、確認用の表示とCSVを明示し、ポータル未反映に戻れる", async ({
  page,
}) => {
  const finance = createFinanceSeed("2026-10-22");
  finance.reports[0].memo = "保持を確認する架空の入力メモ";
  const portal = createSeed("2026-10-22");
  const financeRaw = JSON.stringify(finance),
    portalRaw = JSON.stringify(portal);
  await page.addInitScript(
    ({ financeRaw, portalRaw }) => {
      if (!localStorage.getItem("wuto-wurk-finance-demo-v1"))
        localStorage.setItem("wuto-wurk-finance-demo-v1", financeRaw);
      if (!localStorage.getItem("wuto-wurk-prototype-v1"))
        localStorage.setItem("wuto-wurk-prototype-v1", portalRaw);
    },
    { financeRaw, portalRaw },
  );
  await page.goto("/daily");
  await expect(page.getByText("ポータル未反映", { exact: true })).toBeVisible();
  await expect(page.locator(".finance-kpi")).toHaveCount(0);
  await page
    .getByRole("button", { name: "サンプルで操作を試す", exact: true })
    .click();
  await expect(page.locator(".finance-source-banner")).toContainText(
    "確認用データを表示しています",
  );
  await expect(page.locator(".finance-kpi").first()).toContainText(
    "確認用の累計売上",
  );
  await page.getByRole("tab", { name: "日報一覧", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV保存", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^確認用-日報-/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("データ区分");
  expect(csv).toContain("確認用（実績未照合）");
  await page.reload();
  await expect(page.locator(".finance-source-banner")).toBeVisible();
  await page
    .getByRole("button", { name: "サンプルを閉じる", exact: true })
    .click();
  await expect(page.getByText("ポータル未反映", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".finance-kpi")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wuto-wurk-finance-demo-v1"),
    ),
  ).toBe(financeRaw);
  expect(
    await page.evaluate(() => localStorage.getItem("wuto-wurk-prototype-v1")),
  ).toBe(portalRaw);
});
