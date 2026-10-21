import { expect, test } from "@playwright/test";
import { addDays, today, weekStart } from "../../src/lib/domain";

test("ホームに目標・進捗があり、モバイルでは理念より先に表示される", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /今日の一歩が、\s*未来をつくる。/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "達成率" }),
  ).toHaveAttribute("aria-valuenow", "33");
  await expect(page.locator(".goal-card")).toHaveCount(3);
  if (testInfo.project.name === "mobile") {
    const goalBox = await page.locator(".weekly-section").boundingBox();
    const visionBox = await page.locator(".vision-banner").boundingBox();
    expect(goalBox!.y).toBeLessThan(visionBox!.y);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("目標の作成・編集・保存・検索・履歴", async ({ page }) => {
  await page.goto("/plans");
  await page.getByRole("button", { name: "次の週", exact: true }).click();
  await page.getByRole("button", { name: "目標を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("今週の目標").fill("架空の試作メニューを共有する");
  await dialog
    .getByLabel("具体的な行動")
    .fill("朝礼でおすすめの一言を確認する。");
  await dialog.getByLabel("担当者").fill("架空担当Z");
  await dialog.getByRole("button", { name: "目標を保存" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "架空の試作メニューを共有する" })
    .click();
  await page.getByRole("button", { name: "目標を編集" }).click();
  await page.getByLabel("達成状況", { exact: true }).selectOption("完了");
  await page.getByText("成果・振り返りを記録する").click();
  await page
    .getByLabel("成果", { exact: true })
    .fill("全員でおすすめを共有できた");
  await page.getByLabel("振り返り", { exact: true }).fill("次は声かけを増やす");
  await page.getByRole("button", { name: "目標を保存" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await page.reload();
  await page
    .getByRole("textbox", { name: "過去の記録を検索" })
    .fill("全員でおすすめ");
  await expect(page.locator(".goal-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "架空の試作メニューを共有する" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "変更履歴", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("目標を更新", { exact: false }),
  ).toBeVisible();
  await page.getByRole("dialog").getByText("変更内容を見る").first().click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("全員でおすすめを共有できた", { exact: true }),
  ).toBeVisible();
});

test("先週の複製・二重実行防止・未完了繰越・上限", async ({ page }) => {
  await page.goto("/plans");
  await expect(page.getByRole("button", { name: "目標を追加" })).toBeDisabled();
  await page.getByRole("button", { name: "次の週", exact: true }).click();
  await page.getByRole("button", { name: "先週から複製" }).click();
  await expect(page.locator(".goal-card")).toHaveCount(3);
  await page.getByRole("button", { name: "先週から複製" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "移行できる目標がありません",
  );
  await page.getByRole("button", { name: "前の週", exact: true }).click();
  await page
    .getByRole("button", { name: "完了にする", exact: true })
    .first()
    .click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "67",
  );
  // Use an empty second store to verify carrying only unfinished goals.
  await page.getByLabel("表示する店舗").selectOption("816");
  await expect(page.locator(".goal-card")).toHaveCount(2);
  await page.getByRole("button", { name: "未完了を翌週へ" }).click();
  await expect(page.locator(".goal-card")).toHaveCount(1);
  await expect(page.locator(".status-badge")).toHaveText("未着手");
});

test("一般スタッフ・店舗管理者・全社・システム管理者のUIプレビュー", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("staff");
  await page.goto("/plans");
  await expect(page.getByRole("button", { name: "目標を追加" })).toHaveCount(0);
  await expect(page.getByLabel("表示する店舗")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "旬のパスタのおすすめを揃える" }),
  ).toHaveCount(0);
  await page.goto("/library");
  await expect(
    page.getByRole("button", { name: /管理者向け運用ガイド/ }),
  ).toHaveCount(0);
  await page.goto("/vision");
  await expect(
    page.getByRole("button", { name: "この期間を編集" }),
  ).toHaveCount(0);
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("manager");
  await page.getByLabel("所属店舗", { exact: true }).selectOption("816");
  await page.goto("/plans");
  await expect(page.getByRole("button", { name: "目標を追加" })).toBeEnabled();
  await expect(page.getByLabel("表示する店舗")).toHaveCount(0);
  await expect(page.locator(".goal-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "地元食材の魅力を、一言添えて届ける" }),
  ).toHaveCount(0);
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("company");
  await page.goto("/plans");
  await page.getByLabel("表示する店舗").selectOption("all");
  await expect(page.locator(".goal-card")).toHaveCount(5);
  await page.goto("/settings");
  await page.getByLabel("確認するシステム権限").selectOption("system");
  await page.goto("/vision");
  await expect(
    page.getByRole("button", { name: "この期間を編集" }),
  ).toBeVisible();
});

test("ビジョンの期間切替・編集・保存", async ({ page }) => {
  await page.goto("/vision");
  await page.getByRole("button", { name: /2029 — 2031/ }).click();
  await expect(
    page
      .locator(".phase-detail")
      .getByRole("heading", { name: "ベトナムで海外モデル実証" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "この期間を編集" }).click();
  await page.getByLabel("期間の目標").fill("架空の海外モデル実証");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(
    page
      .locator(".phase-detail")
      .getByRole("heading", { name: "架空の海外モデル実証" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /架空の海外モデル実証/ }).click();
  await expect(
    page
      .locator(".phase-detail")
      .getByRole("heading", { name: "架空の海外モデル実証" }),
  ).toBeVisible();
});

test("資料検索・閲覧とダイアログのキーボード操作", async ({ page }) => {
  await page.goto("/library");
  await page.getByLabel("資料を検索").fill("成長ポータル");
  await expect(page.locator(".document-card")).toHaveCount(1);
  await page.getByRole("button", { name: /成長ポータルの使い方/ }).click();
  await expect(
    page.getByRole("dialog").getByText("この試作品の保存について"),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /成長ポータルの使い方/ }),
  ).toBeFocused();
});

test("担当者・達成状況・期限で絞り込み、過去の週を検索できる", async ({
  page,
}) => {
  await page.goto("/plans");
  await page.getByLabel("担当者で絞り込む").selectOption("キッチン担当C");
  await expect(page.locator(".goal-card")).toHaveCount(1);
  await page.getByLabel("達成状況で絞り込む").selectOption("未着手");
  await page.getByLabel("期限で絞り込む").fill(addDays(weekStart(today()), 6));
  await expect(page.locator(".goal-card")).toHaveCount(1);
  await page.getByLabel("期限で絞り込む").fill(addDays(weekStart(today()), 5));
  await expect(page.locator(".goal-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "条件に合う目標がありません" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "解除", exact: true }).click();
  await expect(page.locator(".goal-card")).toHaveCount(3);
  await page.getByLabel("過去の記録を検索").fill("ランチのおすすめ");
  await expect(page.locator(".goal-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "ランチのおすすめをみんなで共有する" }),
  ).toBeVisible();
});

test("各画面は狭いスマートフォンとタブレットでも横にはみ出さない", async ({
  page,
}) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/vision", "/plans", "/library", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
    }
  }
});
