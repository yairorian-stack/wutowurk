import { expect, test } from "@playwright/test";

test("ホームの作成ボタンから20項目の自己評価を開き、未回答・対象外・暫定を区別する", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: /自己評価シートを作成/ }).click();
  await expect(page).toHaveURL(/\/self-evaluation$/);
  await expect(
    page.getByRole("heading", { name: /自己評価シート/ }),
  ).toBeVisible();
  await expect(page.locator(".evaluation-item")).toHaveCount(20);
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
  await page
    .locator(".evaluation-item")
    .nth(0)
    .getByRole("radio", { name: "5点", exact: true })
    .check();
  await expect(page.locator(".evaluation-score")).toContainText("100点");
  await expect(page.locator(".evaluation-summary")).toContainText("暫定点");
  await expect(page.locator(".evaluation-band")).toHaveCount(0);
  await page
    .locator(".evaluation-item")
    .nth(1)
    .getByRole("radio", { name: "対象外", exact: true })
    .check();
  await expect(page.locator(".evaluation-answer-status")).toContainText(
    "2 / 20項目回答",
  );
  await expect(page.locator(".evaluation-answer-status")).toContainText(
    "採点 1・対象外 1・未回答 18",
  );
  await page
    .getByRole("button", { name: "項目1の回答を取り消す", exact: true })
    .click();
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("部門別の回答・振り返りを保持し、氏名や評価を保存・送信しない", async ({
  page,
}) => {
  await page.goto("/self-evaluation");
  const stored = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") writes.push(r.url());
  });
  await page
    .getByLabel("自己評価の氏名", { exact: true })
    .fill("確認用スタッフ");
  await page
    .getByLabel("自己評価の勤務店舗", { exact: true })
    .selectOption("816");
  await page
    .getByLabel("自己評価の対象期間", { exact: true })
    .fill("39期 前期");
  await page
    .locator(".evaluation-item")
    .first()
    .getByRole("radio", { name: "4点", exact: true })
    .check();
  await page
    .getByLabel("自分が成長したこと・強み", { exact: true })
    .fill("架空の調理の振り返り");
  await page.getByRole("button", { name: "接客部門", exact: true }).click();
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
  await expect(page.locator(".evaluation-sheet-heading")).toContainText(
    "検討案",
  );
  await page
    .locator(".evaluation-item")
    .first()
    .getByRole("radio", { name: "2点", exact: true })
    .check();
  await page
    .getByLabel("自分が成長したこと・強み", { exact: true })
    .fill("架空の接客の振り返り");
  await page.getByRole("button", { name: "部門リーダー", exact: true }).click();
  await expect(page.locator(".evaluation-item")).toHaveCount(20);
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
  await page.getByRole("button", { name: "調理部門", exact: true }).click();
  await expect(
    page
      .locator(".evaluation-item")
      .first()
      .getByRole("radio", { name: "4点", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("自分が成長したこと・強み", { exact: true }),
  ).toHaveValue("架空の調理の振り返り");
  await page.getByRole("button", { name: "接客部門", exact: true }).click();
  await expect(
    page
      .locator(".evaluation-item")
      .first()
      .getByRole("radio", { name: "2点", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("自分が成長したこと・強み", { exact: true }),
  ).toHaveValue("架空の接客の振り返り");
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual(stored);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(page.getByLabel("自己評価の氏名", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
});

test("100点換算した結果をコピーし、選択した回答と振り返りを印刷できる", async ({
  page,
}, testInfo) => {
  await page.goto("/self-evaluation");
  for (const item of await page.locator(".evaluation-item").all())
    await item.getByRole("radio", { name: "4点", exact: true }).check();
  await page
    .locator(".evaluation-item")
    .last()
    .getByRole("radio", { name: "対象外", exact: true })
    .check();
  await page
    .getByLabel("次回評価までの行動目標", { exact: true })
    .fill("架空の目標：確認と共有を続ける");
  await expect(page.locator(".evaluation-score")).toContainText("80点");
  await expect(page.locator(".evaluation-band")).toContainText("A");
  await page.evaluate(() => {
    const target = window as unknown as { copied?: string; printed?: boolean };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          target.copied = text;
        },
      },
    });
    window.print = () => {
      target.printed = true;
    };
  });
  await page
    .getByRole("button", { name: "評価結果をコピー", exact: true })
    .click();
  const copied = await page.evaluate(
    () => (window as unknown as { copied: string }).copied,
  );
  expect(copied).toContain("80点（100点換算）");
  expect(copied).toContain("自己評価の区分目安：A");
  expect(copied).toContain("採点19・対象外1・未回答0");
  expect(copied).toContain("架空の目標");
  await page
    .getByRole("button", { name: "印刷・PDF保存", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { printed: boolean }).printed,
    ),
  ).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(
    page.locator(".evaluation-printed-answer").first(),
  ).toBeVisible();
  await expect(page.locator(".evaluation-printed-answer").last()).toHaveText(
    "対象外",
  );
  await expect(page.locator(".evaluation-rating-options").first()).toBeHidden();
  await expect(
    page.locator(".evaluation-reflection-text").last(),
  ).toContainText("架空の目標");
  await page.pdf({
    path: testInfo.outputPath("self-evaluation.pdf"),
    format: "A4",
    printBackground: true,
  });
});

test("コピーが拒否されても手動コピーを用意し、全項目対象外は点数を付けない", async ({
  page,
}) => {
  await page.goto("/self-evaluation");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    }),
  );
  await page
    .locator(".evaluation-item")
    .first()
    .getByRole("radio", { name: "3点", exact: true })
    .check();
  await page
    .getByRole("button", { name: "評価結果をコピー", exact: true })
    .click();
  await expect(page.getByLabel("コピー用の評価結果")).toHaveValue(
    /WUTO-WURK 自己評価シート/,
  );
  await expect(page.getByRole("status")).toContainText(
    "自動コピーを利用できません",
  );
  await page.reload();
  for (const item of await page.locator(".evaluation-item").all())
    await item.getByRole("radio", { name: "対象外", exact: true }).check();
  await expect(page.locator(".evaluation-answer-status")).toContainText(
    "20 / 20項目回答",
  );
  await expect(page.locator(".evaluation-score")).toContainText("未採点");
  await expect(page.locator(".evaluation-band")).toHaveCount(0);
  await expect(page.locator(".evaluation-score-note")).toContainText(
    "全項目が対象外",
  );
});
