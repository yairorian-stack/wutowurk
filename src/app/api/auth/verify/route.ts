import { cookies } from "next/headers";
import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authClient, authJson, readSmallJson } from "@/lib/auth-server";
import { emailVerifySchema } from "@/lib/otp-security";
import { otpCookie, otpGuard, otpAllowlist } from "@/lib/email-otp-server";
import { memberSchema } from "@/lib/membership";
export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return authJson({ message: "ログインの接続設定が必要です。" }, 503);
  if (!allowedOrigin(request, config)) return authJson({ message: "許可されていない操作です。" }, 403);
  const began = Date.now();
  const denied = async () => {
    // A failed verification has the same bounded response window whether the
    // address is unlisted, limited, missing a challenge or rejected by Auth.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 3500 - (Date.now() - began))));
    return authJson({ message: "確認コードが正しくないか、有効期限が切れています。" }, 401);
  };
  const supabase = (await authClient(3000))!;
  let acquired = false;
  try {
    const parsed = emailVerifySchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return denied();
    const jar = await cookies(), token = jar.get(otpCookie)?.value;
    if (!otpGuard.consume(token, parsed.data.email, otpAllowlist())) return denied();
    const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
    if (error || !data.session) return denied();
    acquired = true;
    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (userError || !verified.user?.email_confirmed_at || verified.user.email?.toLowerCase() !== parsed.data.email) throw new Error("identity-denied");
    const { data: profile, error: profileError } = await supabase.rpc("portal_accept_email_invitation");
    const member = memberSchema.safeParse(profile);
    if (profileError || !member.success || member.data.user_id !== verified.user.id ||
        member.data.email !== parsed.data.email || member.data.status !== "approved") throw new Error("not-approved");
    otpGuard.finish(token!);
    jar.set(otpCookie, "", { path: "/api/auth", maxAge: 0, httpOnly: true, secure: config.secure, sameSite: "lax" });
    return authJson({ approved: true });
  } catch {
    if (acquired) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return denied();
  }
}
