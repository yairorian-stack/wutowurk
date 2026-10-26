"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Leaf, LockKeyhole } from "lucide-react";
export function Login({ configured, failed = false }: { configured: boolean; failed?: boolean }) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(failed ? "ログインできませんでした。登録済みの氏名・Googleアカウントをご確認ください。" : "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/auth/google",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            displayName: name,
            email,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ??
            "認証できませんでした。時間をおいてお試しください。",
        );
      if (typeof result.url !== "string") throw new Error("Googleログインを開始できませんでした。");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <Leaf size={28} />
        <strong>WUTO-WURK</strong>
        <span>GROWTH PORTAL</span>
      </div>
      <section className="auth-card" aria-labelledby="login-title">
        <span className="auth-icon">
          <LockKeyhole size={28} />
        </span>
        <p className="eyebrow">GROW TOGETHER.</p>
        <h1 id="login-title">スタッフログイン</h1>
        <p className="auth-lead">
          一皿から、その土地を好きになる。
          <br />
          チームの成長を、ここから。
        </p>
        {!configured && (
          <div className="auth-notice" role="status">
            <strong>ログインの設定準備中です</strong>
            <p>
              認証サービスの接続後に利用できます。現在、Googleログインと社内画面へのログインはできません。
            </p>
          </div>
        )}
        <form onSubmit={submit}>
          <label>
            氏名<span>必須</span>
            <input
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="登録する氏名"
            />
          </label>
          <label>
            メールアドレス<span>必須</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="name@example.com"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={!configured || busy}
          >
            {busy ? "Googleへ移動中…" : <><ArrowRight size={18} />Googleでログイン</>}
          </button>
        </form>
        <p className="auth-footnote">
          事前登録されたGoogleアカウントのみ利用できます。登録済みの氏名・メールアドレスを入力し、同じGoogleアカウントを選んでください。
        </p>
      </section>
      <p className="auth-motto">人が育ち、店舗が育ち、地域が育つ。</p>
    </main>
  );
}
export function LogoutButton() {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            const result = await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "same-origin",
            });
            if (!result.ok) throw new Error();
            window.location.replace("/login");
          } catch {
            setError("ログアウトできませんでした。接続を確認してください。");
          }
        }}
      >
        ログアウト
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  );
}
