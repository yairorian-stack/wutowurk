import { cookies } from "next/headers";
import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authClient, authJson, readSmallJson } from "@/lib/auth-server";
import { loginSchema } from "@/lib/membership";

export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return authJson({ message: "ログインの接続設定が必要です。" }, 503);
  if (!allowedOrigin(request, config)) return authJson({ message: "許可されていない操作です。" }, 403);
  try {
    const parsed = loginSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return authJson({ message: "氏名とメールアドレスを入力してください。" }, 400);
    const supabase = (await authClient())!;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${config.origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account", login_hint: parsed.data.email },
        scopes: "openid email profile",
      },
    });
    // Never return a caller-controlled destination or request Google Drive/Gmail access.
    const destination = data.url ? new URL(data.url) : null;
    if (error || !destination || destination.origin !== config.url || destination.pathname !== "/auth/v1/authorize")
      return authJson({ message: "Googleログインを開始できませんでした。" }, 503);
    (await cookies()).set("wuto-oauth-attempt", JSON.stringify(parsed.data), {
      httpOnly: true, secure: config.secure, sameSite: "lax", path: "/auth/callback", maxAge: 600,
    });
    return authJson({ url: destination.href });
  } catch {
    return authJson({ message: "入力内容と接続状況をご確認ください。" }, 400);
  }
}
