import { describe, expect, it } from "vitest";
import { authConfig, allowedOrigin } from "../../src/lib/auth-config";
import {
  loginSchema,
  memberUpdateSchema,
  normalizedName,
} from "../../src/lib/membership";
describe("ログインと登録情報の入力検証", () => {
  it("氏名・メールを必須にし、不正メールと制御文字を拒否する", () => {
    expect(
      loginSchema.safeParse({ displayName: "", email: "staff@example.com" })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ displayName: "スタッフA", email: "" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        displayName: "スタッフA\n",
        email: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      loginSchema.parse({
        displayName: " スタッフA ",
        email: " STAFF@EXAMPLE.COM ",
      }).email,
    ).toBe("staff@example.com");
    expect(normalizedName("スタッフ Ａ")).toBe("スタッフA");
  });
  it("所属未定のスタッフを承認しない。役職と権限は別々の値", () => {
    const data = {
      userId: "11111111-1111-4111-8111-111111111111",
      jobTitle: "社員",
      role: "staff",
      storeId: null,
      status: "approved",
    };
    expect(memberUpdateSchema.safeParse(data).success).toBe(false);
    expect(
      memberUpdateSchema.safeParse({ ...data, storeId: "honten" }).success,
    ).toBe(true);
  });
  it("未設定・秘密鍵・不正URL・本番HTTPを拒否し、ローカル試験のみHTTPを許可", () => {
    const base = {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      PORTAL_ORIGIN: "https://portal.example.com",
    };
    expect(authConfig({})).toBeNull();
    expect(authConfig(base)).not.toBeNull();
    expect(authConfig({ SUPABASE_URL: base.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: base.SUPABASE_PUBLISHABLE_KEY, RENDER_EXTERNAL_URL: "https://pilot.onrender.com" })?.origin).toBe("https://pilot.onrender.com");
    expect(
      authConfig({
        ...base,
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_must_not_be_used",
      }),
    ).toBeNull();
    expect(
      authConfig({ ...base, PORTAL_ORIGIN: "http://portal.example.com" }),
    ).toBeNull();
    expect(
      authConfig({ ...base, PORTAL_ORIGIN: "https://portal.example.com/path" }),
    ).toBeNull();
    const config = authConfig({
      ...base,
      PORTAL_ORIGIN: "http://127.0.0.1:3100",
      SUPABASE_URL: "http://127.0.0.1:3101",
    })!;
    expect(config.secure).toBe(false);
    expect(
      allowedOrigin(
        new Request("http://127.0.0.1:3100", {
          headers: { origin: "https://evil.example" },
        }),
        config,
      ),
    ).toBe(false);
    expect(
      allowedOrigin(
        new Request("http://127.0.0.1:3100", {
          headers: { origin: config.origin },
        }),
        config,
      ),
    ).toBe(true);
  });
});
