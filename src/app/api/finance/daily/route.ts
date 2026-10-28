import { allowedOrigin, authConfig } from "@/lib/auth-config";
import { authClient, authJson, getAccess, readSmallJson } from "@/lib/auth-server";
import { managerDailyInputSchema, managerSalesTotal } from "@/lib/manager-daily";

export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return authJson({ message: "認証の設定が必要です。" }, 503);
  if (!allowedOrigin(request, config))
    return authJson({ message: "この操作は許可されていません。" }, 403);
  const access = await getAccess();
  const member = access.member;
  if (!member || member.status !== "approved")
    return authJson({ message: "ログインし直してください。" }, 401);
  try {
    const parsed = managerDailyInputSchema.safeParse(
      await readSmallJson(request, 32_768),
    );
    if (!parsed.success)
      return authJson({ message: "日報の入力内容を確認してください。" }, 400);
    const input = parsed.data;
    const canEdit =
      ["company", "system"].includes(member.role) ||
      (member.role === "manager" && member.store_id === input.storeId);
    if (!canEdit)
      return authJson(
        { message: "この店舗の日報を登録する権限がありません。" },
        403,
      );
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (input.reportDate < "2026-08-01" || input.reportDate > today)
      return authJson({ message: "営業日を確認してください。" }, 400);
    if (managerSalesTotal(input) > 10_000_000_000)
      return authJson({ message: "売上金額を確認してください。" }, 400);
    const client = await authClient();
    if (!client) return authJson({ message: "保存先へ接続できません。" }, 503);
    const { error } = await client.rpc("portal_submit_manager_daily", {
      p_store_id: input.storeId,
      p_report_date: input.reportDate,
      p_cash_sales_jpy: input.cashSalesJpy,
      p_credit_sales_jpy: input.creditSalesJpy,
      p_qr_sales_jpy: input.qrSalesJpy,
      p_gift_certificate_jpy: input.giftCertificateJpy,
      p_other_cashless_jpy: input.otherCashlessJpy,
      p_labor_minutes: input.laborMinutes,
      p_voucher_count: input.voucherCount,
      p_voucher_discount_jpy: input.voucherDiscountJpy,
      p_memo: input.memo,
      p_expenses: input.expenses.map((expense) => ({
        category: expense.category,
        description: expense.description,
        amount_jpy: expense.amountJpy,
      })),
    });
    if (error?.code === "PGRST202")
      return authJson({ message: "日報入力機能の初期設定が必要です。" }, 503);
    if (error)
      return authJson(
        { message: "保存できませんでした。権限と入力内容をご確認ください。" },
        error.code === "42501" ? 403 : 503,
      );
    return authJson({ saved: true, salesJpy: managerSalesTotal(input) });
  } catch {
    return authJson({ message: "日報の入力内容を確認してください。" }, 400);
  }
}
