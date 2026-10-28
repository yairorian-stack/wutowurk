import { describe, it, expect } from "vitest";
import { OtpGuard, parseOtpAllowlist, emailVerifySchema } from "../../src/lib/otp-security";
const email = "owner@example.invalid", allowed = new Set([email]);
describe("メールOTPの送信許可・試行回数・期限", () => {
  it("6桁だけ受け付け、アドレスは正規化する。設定の誤りは全体を閉じる", () => {
    expect(emailVerifySchema.parse({ email: " OWNER@EXAMPLE.INVALID ", code: "012345" }).email).toBe(email);
    for (const code of ["12345", "1234567", "abcdef"]) expect(emailVerifySchema.safeParse({ email, code }).success).toBe(false);
    expect(parseOtpAllowlist(" OWNER@EXAMPLE.INVALID ").has(email)).toBe(true);
    expect(parseOtpAllowlist(email + ",broken").size).toBe(0);
    expect(parseOtpAllowlist(undefined).size).toBe(0);
  });
  it("登録外の宛先も同じ形のトークンを返すが送信もコード検証も許可しない", () => {
    const g = new OtpGuard(), a = g.begin(email, "ip", allowed), b = g.begin("other@example.invalid", "ip", allowed);
    expect(a.token.length).toBe(b.token.length); expect(a.send).toBe(true); expect(b.send).toBe(false);
    expect(g.consume(b.token, "other@example.invalid", allowed)).toBe(false);
    expect(g.consume(a.token, "other@example.invalid", allowed)).toBe(false);
    expect(g.consume(undefined, email, allowed)).toBe(false);
  });
  it("1分以内の再送を抑止し、同じブラウザーの有効な試行は保持する", () => {
    let now = 1000; const g = new OtpGuard(() => now);
    const first = g.begin(email, "ip", allowed);
    const again = g.begin(email, "ip", allowed, first.token);
    expect(again).toEqual({ token: first.token, send: false });
    expect(g.begin(email, "different-ip", allowed).send).toBe(false);
    now += 60_000;
    expect(g.begin(email, "ip", allowed, first.token).send).toBe(true);
    expect(g.consume(first.token, email, allowed)).toBe(false);
  });
  it("1時間5通を上限にし、再起動をまたぐ制限はSupabase側にも必要", () => {
    let now = 1000; const g = new OtpGuard(() => now);
    for (let i = 0; i < 5; i++) { expect(g.begin(email, "ip", allowed).send).toBe(true); now += 60_000; }
    expect(g.begin(email, "another-ip", allowed).send).toBe(false);
    now += 3600_000; expect(g.begin(email, "ip", allowed).send).toBe(true);
  });
  it("5回の検証で閉じ、成功後の再利用・10分後・許可削除後は拒否", () => {
    let now = 1000; const g = new OtpGuard(() => now), a = g.begin(email, "ip", allowed);
    for (let i = 0; i < 5; i++) expect(g.consume(a.token, email, allowed)).toBe(true);
    expect(g.consume(a.token, email, allowed)).toBe(false);
    now += 60_000; const b = g.begin(email, "ip", allowed);
    expect(g.consume(b.token, email, new Set())).toBe(false); g.finish(b.token);
    expect(g.consume(b.token, email, allowed)).toBe(false);
    now += 60_000; const c = g.begin(email, "ip", allowed); now += 600_000;
    expect(g.consume(c.token, email, allowed)).toBe(false);
  });
});
