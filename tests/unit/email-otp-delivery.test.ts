import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signInWithOtp: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/auth-config", () => ({ authConfig: () => ({ url: "https://example.supabase.co", key: "publishable" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { sendEmailOtp } from "../../src/lib/email-otp-server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PORTAL_OTP_ALLOWED_EMAILS", "invited@example.invalid");
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc, auth: { signInWithOtp: mocks.signInWithOtp } });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
});

describe("招待済みスタッフへの初回メールOTP", () => {
  it("許可済みの宛先は初回Authアカウント作成を伴うOTPを要求できる", async () => {
    await sendEmailOtp("invited@example.invalid");
    expect(mocks.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: "invited@example.invalid", options: { shouldCreateUser: true },
    });
  });
  it("登録外の宛先は認証サービスにも問い合わせない", async () => {
    await sendEmailOtp("unlisted@example.invalid");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([undefined, "invited@example.invalid,broken"])("空・不正な許可設定では送信しない (%s)", async (value) => {
    vi.stubEnv("PORTAL_OTP_ALLOWED_EMAILS", value);
    await sendEmailOtp("invited@example.invalid");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
  it.each([{ data: false, error: null }, { data: true, error: { code: "unavailable" } }])("DBの準備確認に失敗したら送信しない", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    await sendEmailOtp("invited@example.invalid");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
});
