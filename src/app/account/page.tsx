export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth-server";
import { LogoutButton } from "@/components/login";
export default async function Page() {
  const access = await getAccess();
  if (access.state === "anonymous" || access.state === "unconfigured")
    redirect("/login");
  if (access.state === "approved") redirect("/");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">WUTO-WURK GROWTH PORTAL</p>
        <h1>
          {access.state === "pending"
            ? "管理者の承認待ちです"
            : access.state === "unavailable"
              ? "接続状況を確認しています"
              : "アカウントをご確認ください"}
        </h1>
        <p className="auth-lead">
          {access.state === "pending"
            ? "メールの本人確認が完了しました。所属店舗・役職・権限の設定後に利用できます。"
            : "現在、社内画面を開けません。管理者へお問い合わせください。"}
        </p>
        {access.member && (
          <p>
            {access.member.display_name}
            <br />
            {access.member.email}
          </p>
        )}
        <LogoutButton />
      </section>
    </main>
  );
}
