import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByText("予備のGoogleログイン", { exact: true }).click();
  await page.getByLabel("氏名", { exact: false }).fill("テストスタッフ");
  await page.getByLabel("メールアドレス", { exact: false }).fill(email);
  await page.getByRole("button", { name: "Googleでログイン", exact: true }).click();
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
test("Googleの氏名・メールを必須にし、別サイトからの開始を拒否する", async ({ request }) => {
  const empty = await request.post("/api/auth/google", {
    headers: { Origin: "http://127.0.0.1:3100" }, data: { displayName: "", email: "staff@example.invalid" },
  });
  expect(empty.status()).toBe(400);
  const foreign = await request.post("/api/auth/google", {
    headers: { Origin: "https://evil.example" }, data: { displayName: "テストスタッフ", email: "staff@example.invalid" },
  });
  expect(foreign.status()).toBe(403);

});
test("未登録・別のGoogleアカウント・Google以外の認証・停止済みはログインできない", async ({ page }) => {
  for (const prefix of ["unlisted", "mismatch", "emailonly", "disabled", "cancel"]) {
    await login(page, `${prefix}-e2e@example.invalid`);
    await expect(page).toHaveURL(/\/login\?error=google$/);
    await expect(page.locator(".auth-card").getByRole("alert")).toContainText("登録済みの氏名・Googleアカウント");
    await page.goto("/daily");
    await expect(page).toHaveURL(/\/login$/);
  }
});
test("PKCEの開始情報がないコールバックと外部転送先は受け付けない", async ({ page }) => {
  await page.goto("/auth/callback?code=forged&next=https://evil.example");
  await expect(page).toHaveURL("http://127.0.0.1:3100/login?error=google");
});
test("Google確認後も未承認なら社内画面へ入れず、権限変更を拒否する", async ({
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
  await page.getByText("予備のGoogleログイン", { exact: true }).click();
  await page.getByLabel("氏名", { exact: false }).fill("別の氏名");
  await page
    .getByLabel("メールアドレス", { exact: false })
    .fill("owner-e2e@example.invalid");
  await page.getByRole("button", { name: "Googleでログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?error=google$/);
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("登録済みの氏名");
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
        name: "Googleでログイン",
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

test("メールと6桁コードでログインでき、コードの再利用では入れない", async ({ page, context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `ui-${info.project.name}` });
  const email = `owner-otp-${info.project.name}@example.invalid`;
  await page.goto("/login");
  await page.getByLabel("メールアドレス", { exact: false }).fill(email);
  await page.getByRole("button", { name: "確認コードを送信", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`http://127.0.0.1:3101/fixture/otp-count?email=${email}`)).json()).count).toBe(1);
  await page.getByLabel("確認コード", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "確認コードでログイン", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  const res = await page.request.post("/api/auth/verify", { headers: { Origin: "http://127.0.0.1:3100" }, data: { email, code: "123456" } });
  expect(res.status()).toBe(401);
  const cookies = await context.cookies();
  expect(cookies.some(c => c.name.includes("auth-token") && c.httpOnly)).toBe(true);
});
test("未登録への送信を行わず、応答とCookieの形から登録状況を公開しない", async ({ page }, info) => {
  const email = `unlisted-otp-${info.project.name}@example.invalid`;
  const response = await page.request.post("/api/auth/request", { headers: { Origin: "http://127.0.0.1:3100" }, data: { email } });
  expect(response.status()).toBe(200); expect(await response.json()).toEqual({ accepted: true, message: "登録済みのアドレスの場合、確認コードを送信します。" });
  const count = await page.request.get(`http://127.0.0.1:3101/fixture/otp-count?email=${email}`);
  expect((await count.json()).count).toBe(0);
  const denied = await page.request.post("/api/auth/verify", { headers: { Origin: "http://127.0.0.1:3100" }, data: { email, code: "123456" } });
  expect(denied.status()).toBe(401);
  await page.goto("/daily"); await expect(page).toHaveURL(/\/login$/);
});
test("コード誤りと試行上限を拒否し、メール失敗時もGoogleを予備として残す", async ({ page, context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `wrong-${info.project.name}` });
  const email = `owner-wrong-${info.project.name}@example.invalid`;
  const headers = { Origin: "http://127.0.0.1:3100" };
  await page.request.post("/api/auth/request", { headers, data: { email } });
  await expect.poll(async () => (await (await page.request.get(`http://127.0.0.1:3101/fixture/otp-count?email=${email}`)).json()).count).toBe(1);
  for (let i = 0; i < 5; i++) expect((await page.request.post("/api/auth/verify", { headers, data: { email, code: "999999" } })).status()).toBe(401);
  expect((await page.request.post("/api/auth/verify", { headers, data: { email, code: "123456" } })).status()).toBe(401);
  await page.goto("/daily"); await expect(page).toHaveURL(/\/login$/);
  const failure = `deliveryfail-${info.project.name}@example.invalid`;
  expect((await page.request.post("/api/auth/request", { headers, data: { email: failure } })).status()).toBe(200);
  await login(page, `legacy-${info.project.name}@example.invalid`);
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("許可ユーザーの実績確認画面は共有売上を表示し、未認証の応答へ含めない", async ({ page }, info) => {
  const anon = await page.request.get("/daily"); expect(await anon.text()).not.toContain("架空の共有実績テスト");
  await login(page, "owner-sales@example.invalid"); await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "実績売上の集計" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "現金出納帳", exact: true })).toBeVisible();
  await expect(page.getByText("選択店舗の出納帳は取込準備中、または原本確認待ちです。", { exact: false })).toBeVisible();
  await page.getByLabel("表示する店舗", { exact: true }).selectOption("all");
  await expect(page.getByTestId("imported-sales-total")).toContainText("2,500");
  await expect(page.getByRole("rowheader", { name: "10/01（木）", exact: true })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "10/02（金）", exact: true })).toBeVisible();
  await expect(page.locator('time[datetime="2026-10-01"]')).toHaveText("10/01（木）");
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("rowheader", { name: "10/01（木）", exact: true })).toBeVisible();
  }
  await expect(page.getByText("元の集計結果は、まだポータルへ反映されていません。", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("売上ファイルを読み込む（JSON）")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "サンプルで操作を試す" })).toHaveCount(0);
});

test("日次取込の実績と本店出納帳・更新警告を権限内で表示する",async({page},info)=>{
  const anon=await page.request.get("/daily");expect(await anon.text()).not.toContain("架空の出納帳明細");
  await login(page,`owner-sync-${info.project.name}@example.invalid`);await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/daily");
  await page.getByLabel("表示する店舗",{exact:true}).selectOption("all");
  await expect(page.getByLabel("自動取込の状況")).toContainText("取込成功");
  await expect(page.getByText("羽ノ浦店・2026-08：原本の月・残高確認待ち",{exact:false})).toBeVisible();
  const cash=page.getByRole("table",{name:/本店現金出納帳・2026-10/});
  await expect(cash.getByText("架空の出納帳明細")).toBeVisible();
  await expect(page.getByRole("table",{name:/羽ノ浦店現金出納帳・2026-10/}).getByText("架空の羽ノ浦明細")).toBeVisible();
  await expect(page.getByText("羽ノ浦店・2026-09：原本の月・残高確認待ち",{exact:false})).toBeVisible();
  await expect(cash.getByRole("row").last()).toContainText("2,000");
  if(info.project.name==="mobile"){
    await page.setViewportSize({width:320,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByLabel("表示する店舗",{exact:true}).selectOption("816");
  await expect(cash).toHaveCount(0);
});
test("失敗時は前回の正常値を表示し、他店管理者へ本店出納帳を渡さない",async({page},info)=>{
  await login(page,`owner-syncfailed-${info.project.name}@example.invalid`);await expect(page).toHaveURL("http://127.0.0.1:3100/");await page.goto("/daily");
  await expect(page.getByLabel("自動取込の状況")).toContainText("取込失敗");
  await expect(page.getByText("架空の出納帳明細")).toBeVisible();
  await page.request.post("/api/auth/logout",{headers:{origin:"http://127.0.0.1:3100"}});
  await login(page,`manager-other-sync-${info.project.name}@example.invalid`);await expect(page).toHaveURL("http://127.0.0.1:3100/");await page.goto("/daily");
  await expect(page.getByText("羽ノ浦店・2026-08：原本の月・残高確認待ち",{exact:false})).toBeVisible();
  await expect(page.getByText("架空の出納帳明細")).toHaveCount(0);
  expect(await page.content()).not.toContain("架空の出納帳明細");
});

test("月別不一致でも前回の羽ノ浦10月を維持し、本店管理者へ渡さない",async({page},info)=>{
  await login(page,`owner-syncmismatch-${info.project.name}@example.invalid`);await expect(page).toHaveURL("http://127.0.0.1:3100/");await page.goto("/daily");
  await page.getByLabel("表示する店舗",{exact:true}).selectOption("all");
  await expect(page.getByText("羽ノ浦店・2026-10：営業日報の売上と不一致。",{exact:false})).toContainText("前回の正常値");
  await expect(page.getByText("架空の羽ノ浦明細")).toBeVisible();
  await page.request.post("/api/auth/logout",{headers:{origin:"http://127.0.0.1:3100"}});
  await login(page,`manager-sync-${info.project.name}@example.invalid`);await expect(page).toHaveURL("http://127.0.0.1:3100/");await page.goto("/daily");
  await expect(page.getByText("架空の出納帳明細")).toBeVisible();
  expect(await page.content()).not.toContain("架空の羽ノ浦明細");
  await expect(page.getByText("羽ノ浦店・2026-08",{exact:false})).toHaveCount(0);
});
