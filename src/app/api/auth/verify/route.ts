import { authConfig, allowedOrigin } from "@/lib/auth-config";
import { authClient, authJson, readSmallJson } from "@/lib/auth-server";
import { verifySchema, memberSchema, normalizedName } from "@/lib/membership";
export async function POST(request: Request) {
  const config = authConfig();
  if (!config)
    return authJson({ message: "認証サービスの設定が完了していません。" }, 503);
  if (!allowedOrigin(request, config))
    return authJson({ message: "この操作は許可されていません。" }, 403);
  const supabase = (await authClient())!;
  try {
    const parsed = verifySchema.safeParse(await readSmallJson(request));
    if (!parsed.success)
      return authJson(
        { message: "氏名・メールアドレス・確認コードを確認してください。" },
        400,
      );
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.code,
      type: "email",
    });
    if (error || !data.user?.email_confirmed_at || !data.session)
      return authJson(
        { message: "確認コードが正しくないか、有効期限が切れています。" },
        401,
      );
    const { data: profile, error: profileError } = await supabase.rpc(
      "portal_request_access",
      { p_display_name: parsed.data.displayName },
    );
    const member = memberSchema.safeParse(profile);
    if (profileError || !member.success) {
      await supabase.auth.signOut({ scope: "local" });
      return authJson(
        {
          message:
            "登録情報を確認できませんでした。管理者へお問い合わせください。",
        },
        503,
      );
    }
    if (
      member.data.email.toLowerCase() !== data.user.email?.toLowerCase() ||
      normalizedName(member.data.display_name) !==
        normalizedName(parsed.data.displayName) ||
      member.data.status === "disabled"
    ) {
      await supabase.auth.signOut({ scope: "local" });
      return authJson(
        { message: "登録情報をご確認のうえ、管理者へお問い合わせください。" },
        403,
      );
    }
    return authJson({ approved: member.data.status === "approved" });
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return authJson(
      {
        message:
          "本人確認を完了できませんでした。入力内容と接続状況を確認してください。",
      },
      400,
    );
  }
}
