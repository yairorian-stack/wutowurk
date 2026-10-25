import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authClient, authJson, readSmallJson } from "@/lib/auth-server";
import { loginSchema } from "@/lib/membership";
export async function POST(request: Request) {
  const config = authConfig();
  if (!config)
    return authJson({ message: "認証サービスの設定が完了していません。" }, 503);
  if (!allowedOrigin(request, config))
    return authJson({ message: "この操作は許可されていません。" }, 403);
  try {
    const parsed = loginSchema.safeParse(await readSmallJson(request));
    if (!parsed.success)
      return authJson(
        { message: "氏名と正しいメールアドレスを入力してください。" },
        400,
      );
    const supabase = (await authClient())!;
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true },
    });
    if (error)
      return authJson(
        {
          message:
            "確認メールを送信できませんでした。少し待ってからお試しください。",
        },
        error.status === 429 ? 429 : 503,
      );
    return authJson({ sent: true });
  } catch {
    return authJson(
      { message: "入力内容または接続状況をご確認ください。" },
      400,
    );
  }
}
