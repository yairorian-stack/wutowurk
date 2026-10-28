"use client";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
export function Login({ configured, otpAvailable = false, failed = false }: { configured: boolean; otpAvailable?: boolean; failed?: boolean }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email"), [busy, setBusy] = useState(false);
  const [error, setError] = useState(failed ? "ログインできませんでした。登録済みの氏名・Googleアカウントをご確認ください。" : "");
  async function perform(kind: "request" | "verify" | "google") {
    if (!configured || busy || (kind !== "google" && !otpAvailable)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ email, ...(kind === "verify" ? { code } : {}), ...(kind === "google" ? { displayName: name } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "ログインできませんでした。時間をおいてお試しください。");
      if (kind === "request") { setStage("code"); setCode(""); }
      else if (kind === "verify") window.location.replace("/");
      else {
        if (typeof result.url !== "string") throw new Error("Googleログインを開始できませんでした。");
        window.location.assign(result.url);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "接続できませんでした。"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void perform(stage === "email" ? "request" : "verify"); }
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <Image
          src="/wuto-wurk-logo.png"
          alt="レストランカフェ WUTO-WURK SINCE 1987"
          width={300}
          height={211}
          className="auth-brand-logo"
        />
        <div className="auth-brand-copy">
          <strong>WUTO-WURK</strong>
          <span>GROWTH PORTAL</span>
        </div>
      </div>
      <section className="auth-card" aria-labelledby="login-title">
        <span className="auth-icon"><LockKeyhole size={28} /></span>
        <p className="eyebrow">GROW TOGETHER.</p><h1 id="login-title">スタッフログイン</h1>
        <p className="auth-lead">登録済みのメールアドレスに届く<br />6桁の確認コードでログインします。</p>
        {!configured ? <div className="auth-notice" role="status"><strong>ログインの設定準備中です</strong><p>認証サービスの接続後に利用できます。現在、社内画面へのログインはできません。</p></div>
          : !otpAvailable && <div className="auth-notice" role="status"><strong>確認コード方式は準備中です</strong><p>現在は下のGoogleログインをご利用ください。</p></div>}
        <form onSubmit={submit}>
          <label>メールアドレス<span>必須</span><input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} readOnly={stage === "code"} placeholder="登録済みのメールアドレス" /></label>
          {stage === "code" && <>
            <p className="auth-code-note" role="status">登録済みのアドレスの場合、確認コードを送信します。届かない場合は迷惑メールも確認してください。</p>
            <label>確認コード<input name="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6} /></label>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button primary" disabled={!configured || !otpAvailable || busy}>
            {busy ? "確認中…" : stage === "email" ? <><Mail size={18} />確認コードを送信</> : <>確認コードでログイン<ArrowRight size={18} /></>}
          </button>
          {stage === "code" && <button type="button" className="text-button" disabled={busy} onClick={() => { setStage("email"); setCode(""); setError(""); }}>メールアドレスを入力し直す・再送する</button>}
          <details open={!otpAvailable} className="auth-backup"><summary>予備のGoogleログイン</summary>
            <p className="auth-code-note">確認コードが届かない場合は、登録済みのGoogleアカウントを使えます。</p>
            <label>氏名（Googleログイン用）<input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="登録済みの氏名" /></label>
            <button type="button" className="button secondary" disabled={!configured || busy} onClick={() => void perform("google")}>Googleでログイン</button>
          </details>
        </form>
        <p className="auth-footnote">事前登録済みの方のみ利用できます。確認コードは他の人に共有しないでください。コードの有効時間は10分です。再送は1分以上あけてください。</p>
      </section><p className="auth-motto">人が育ち、店舗が育ち、地域が育つ。</p>
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
