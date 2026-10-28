import { after } from "next/server";
import { cookies } from "next/headers";
import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authJson, readSmallJson } from "@/lib/auth-server";
import { emailRequestSchema } from "@/lib/otp-security";
import { otpCookie, otpGuard, otpAllowlist, sendEmailOtp } from "@/lib/email-otp-server";
export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return authJson({ message: "ログインの接続設定が必要です。" }, 503);
  if (!allowedOrigin(request, config)) return authJson({ message: "許可されていない操作です。" }, 403);
  try {
    const { email } = emailRequestSchema.parse(await readSmallJson(request));
    const jar = await cookies();
    const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const attempt = otpGuard.begin(email, ip, otpAllowlist(), jar.get(otpCookie)?.value);
    jar.set(otpCookie, attempt.token, { path: "/api/auth", maxAge: 600, httpOnly: true, secure: config.secure, sameSite: "lax" });
    // Same response, cookie shape and response-before-delivery behavior for
    // unlisted, limited and eligible addresses; never expose membership or SMTP results.
    after(async () => { if (attempt.send) await sendEmailOtp(email); });
    return authJson({ accepted: true, message: "登録済みのアドレスの場合、確認コードを送信します。" });
  } catch {
    return authJson({ message: "正しいメールアドレスを入力してください。" }, 400);
  }
}
