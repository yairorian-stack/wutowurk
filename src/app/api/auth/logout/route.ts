import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authClient, authJson } from "@/lib/auth-server";
export async function POST(request: Request) {
  const config = authConfig();
  if (!config)
    return authJson({ message: "認証サービスの設定が完了していません。" }, 503);
  if (!allowedOrigin(request, config))
    return authJson({ message: "この操作は許可されていません。" }, 403);
  const supabase = (await authClient())!;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return error
    ? authJson({ message: "ログアウトできませんでした。" }, 503)
    : authJson({ signedOut: true });
}
