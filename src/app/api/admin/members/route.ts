import { authConfig, allowedOrigin } from "@/lib/auth-config";
import {
  authClient,
  authJson,
  getAccess,
  readSmallJson,
} from "@/lib/auth-server";
import {
  memberCanManage,
  memberUpdateSchema,
  memberSchema,
} from "@/lib/membership";
export async function GET() {
  const access = await getAccess();
  if (!access.member || !memberCanManage(access.member))
    return authJson(
      { message: "管理権限が必要です。" },
      access.state === "approved" ? 403 : 401,
    );
  const supabase = (await authClient())!;
  const { data, error } = await supabase
    .from("portal_members")
    .select("user_id,email,display_name,job_title,role,store_id,status")
    .order("created_at", { ascending: false });
  const parsed = memberSchema.array().safeParse(data);
  return error || !parsed.success
    ? authJson({ message: "メンバー情報を読み込めませんでした。" }, 503)
    : authJson({ members: parsed.data });
}
export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return authJson({ message: "認証の設定が必要です。" }, 503);
  if (!allowedOrigin(request, config))
    return authJson({ message: "この操作は許可されていません。" }, 403);
  const access = await getAccess();
  if (!access.member || !memberCanManage(access.member))
    return authJson(
      { message: "管理権限が必要です。" },
      access.state === "approved" ? 403 : 401,
    );
  try {
    const parsed = memberUpdateSchema.safeParse(await readSmallJson(request));
    if (!parsed.success)
      return authJson(
        { message: "役職・所属店舗・権限・登録状況を確認してください。" },
        400,
      );
    if (
      access.member.role !== "system" &&
      ["company", "system"].includes(parsed.data.role)
    )
      return authJson(
        { message: "この権限の付与にはシステム管理者の確認が必要です。" },
        403,
      );
    const supabase = (await authClient())!,
      m = parsed.data;
    const { error } = await supabase.rpc("portal_manage_member", {
      p_user_id: m.userId,
      p_job_title: m.jobTitle,
      p_role: m.role,
      p_store_id: m.storeId,
      p_status: m.status,
    });
    return error
      ? authJson(
          { message: "更新できませんでした。権限と所属店舗をご確認ください。" },
          403,
        )
      : authJson({ saved: true });
  } catch {
    return authJson({ message: "入力内容を確認してください。" }, 400);
  }
}
