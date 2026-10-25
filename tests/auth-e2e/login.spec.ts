import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("氏名", { exact: false }).fill("テストスタッフ");
  await page.getByLabel("メールアドレス", { exact: false }).fill(email);
  await page
    .getByRole("button", { name: "確認コードをメールで受け取る", exact: true })
    .click();
  await page.getByLabel("確認コード", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "本人確認してログイン", exact: true })
    .click();
}
test("未ログイン・ローカル保存の偽権限では全ページとメンバーAPIを開けない", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "fake-login",
      JSON.stringify({
        name: "偽名",
        email: "fake@example.invalid",
        role: "system",
        loggedIn: true,
      }),
    );
  });
  for (const path of [
    "/",
    "/daily",
    "/vision",
    "/plans",
    "/self-evaluation",
    "/settings",
    "/shifts",
    "/garbage",
    "/library",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "スタッフログイン" }),
    ).toBeVisible();
  }
  const response = await request.get("/api/admin/members");
  expect(response.status()).toBe(401);
  expect(await response.text()).not.toContain("example.invalid");
});
test("氏名・メール・コードを必須にし、誤った確認コードを拒否する", async ({
  page,
  request,
}) => {
  const empty = await request.post("/api/auth/request", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { displayName: "", email: "staff@example.invalid" },
  });
  expect(empty.status()).toBe(400);
  const foreign = await request.post("/api/auth/request", {
    headers: { Origin: "https://evil.example" },
    data: { displayName: "テストスタッフ", email: "staff@example.invalid" },
  });
  expect(foreign.status()).toBe(403);
  await page.goto("/login");
  await page.getByLabel("氏名", { exact: false }).fill("テストスタッフ");
  await page
    .getByLabel("メールアドレス", { exact: false })
    .fill("staff-invalid@example.invalid");
  await page
    .getByRole("button", { name: "確認コードをメールで受け取る", exact: true })
    .click();
  await page.getByLabel("確認コード", { exact: true }).fill("999999");
  await page
    .getByRole("button", { name: "本人確認してログイン", exact: true })
    .click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("確認コードが正しくない");
  await page.goto("/daily");
  await expect(page).toHaveURL(/\/login$/);
});
test("メール確認後も未承認なら社内画面へ入れず、権限変更を拒否する", async ({
  page,
}) => {
  await login(page, "pending-e2e@example.invalid");
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "管理者の承認待ちです" }),
  ).toBeVisible();
  await page.goto("/daily");
  await expect(page).toHaveURL(/\/account$/);
  const response = await page.request.post("/api/admin/members", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      userId: "11111111-1111-4111-8111-111111111111",
      jobTitle: "総合責任者",
      role: "company",
      storeId: null,
      status: "approved",
    },
  });
  expect(response.status()).toBe(401);
});
test("承認済みスタッフは本人の情報で入り、権限を自分で選べず、ログアウトで再び閉じる", async ({
  page,
  context,
}) => {
  await login(page, "staff-e2e@example.invalid");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "アカウント設定", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("staff-e2e@example.invalid", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("確認するシステム権限")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "スタッフの登録・承認" }),
  ).toHaveCount(0);
  const result = await page.request.get("/api/admin/members");
  expect(result.status()).toBe(403);
  const cookies = (await context.cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "staff-e2e@example.invalid",
  );
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
test("全社管理者には承認画面を表示し、名前違いのログインを認めない", async ({
  page,
}) => {
  await login(page, "owner-e2e@example.invalid");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "スタッフの登録・承認", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("氏名", { exact: false }).fill("別の氏名");
  await page
    .getByLabel("メールアドレス", { exact: false })
    .fill("owner-e2e@example.invalid");
  await page
    .getByRole("button", { name: "確認コードをメールで受け取る", exact: true })
    .click();
  await page.getByLabel("確認コード", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "本人確認してログイン", exact: true })
    .click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("登録情報をご確認");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
test("公開用Pagesは全ハッシュで閉じ、既存業務のコード・実名・確認済みフラグで開かない", async ({
  page,
}) => {
  const html = await readFile("out-pages/index.html", "utf8");
  expect(html).not.toContain("本店のゴミ出し");
  expect(html).not.toContain("wuto-wurk-imported-sales-v1");
  await page.route("https://yairorian-stack.github.io/wutowurk/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  for (const view of ["daily", "settings", "garbage"]) {
    await page.goto(`https://yairorian-stack.github.io/wutowurk/#/${view}`);
    await expect(
      page.getByRole("heading", { name: "スタッフログイン" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "確認コードをメールで受け取る",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
