"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  jobTitles,
  memberCanManage,
  memberSchema,
  type Member,
} from "@/lib/membership";
import { roles, stores, type Role } from "@/lib/domain";
import { LogoutButton } from "./login";
async function fetchMembers() {
  const response = await fetch("/api/admin/members", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("メンバー一覧を読み込めませんでした。");
  const result = await response.json();
  return memberSchema.array().parse(result.members);
}
export function MemberSettings({ member }: { member: Member }) {
  const [members, setMembers] = useState<Member[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const manage = memberCanManage(member);
  async function load() {
    setMembers(await fetchMembers());
  }
  useEffect(() => {
    if (manage) {
      let active = true;
      void fetchMembers()
        .then((rows) => {
          if (active) setMembers(rows);
        })
        .catch(() => {
          if (active) setError("メンバー一覧を読み込めませんでした。");
        });
      return () => {
        active = false;
      };
    }
  }, [manage]);
  async function save(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          jobTitle: data.get("job"),
          role: data.get("role"),
          storeId: data.get("store") || null,
          status: data.get("status"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "更新できませんでした。");
      await load();
      setMessage("メンバーの登録内容を更新しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新できませんでした。");
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>アカウント設定</h1>
          <p className="muted">役職とシステム権限は別々に管理します。</p>
        </div>
      </div>
      <section className="panel member-management">
        <h2>ご本人の登録情報</h2>
        <dl className="member-profile">
          {[
            ["氏名", member.display_name],
            ["メール", member.email],
            ["役職", member.job_title ?? "未設定"],
            [
              "所属店舗",
              stores.find((s) => s.id === member.store_id)?.name ?? "全社",
            ],
            ["システム権限", roles[member.role]],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <LogoutButton />
      </section>
      {manage && (
        <section className="panel member-management">
          <h2>スタッフの登録・承認</h2>
          <p>
            本人がメールで確認した申請を、氏名・所属店舗を確認してから承認してください。
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="local-data-message">
              {message}
            </p>
          )}
          {members.map((m) => (
            <article className="member-request" key={m.user_id}>
              <h3>
                {m.display_name}　
                <span>
                  {m.status === "pending"
                    ? "承認待ち"
                    : m.status === "disabled"
                      ? "停止中"
                      : "登録済み"}
                </span>
              </h3>
              <p className="member-email">{m.email}</p>
              {m.user_id !== member.user_id &&
              (member.role === "system" ||
                !["company", "system"].includes(m.role)) ? (
                <form
                  onSubmit={(e) => {
                    void save(e, m.user_id);
                  }}
                >
                  <label>
                    役職
                    <select
                      name="job"
                      defaultValue={m.job_title ?? "他メンバー"}
                    >
                      {jobTitles.map((j) => (
                        <option key={j}>{j}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    所属店舗
                    <select name="store" defaultValue={m.store_id ?? ""}>
                      <option value="">未指定 / 全社</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.short}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    システム権限
                    <select name="role" defaultValue={m.role}>
                      {(Object.keys(roles) as Role[])
                        .filter(
                          (r) =>
                            member.role === "system" ||
                            ["staff", "manager"].includes(r),
                        )
                        .map((r) => (
                          <option key={r} value={r}>
                            {roles[r]}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    登録状況
                    <select name="status" defaultValue={m.status}>
                      <option value="pending">承認待ち</option>
                      <option value="approved">承認する</option>
                      <option value="disabled">利用停止</option>
                    </select>
                  </label>
                  <button className="button primary" type="submit">
                    登録内容を更新
                  </button>
                </form>
              ) : (
                <p className="small muted">権限：{roles[m.role]}</p>
              )}
            </article>
          ))}
        </section>
      )}
      <p className="small muted">
        現在、業務データはユーザーごとの端末内保存です。スタッフ間で同じ売上・シフトを共有する機能は、共有DBへの移行が必要です。
      </p>
    </>
  );
}
