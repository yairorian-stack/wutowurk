"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Leaf, LockKeyhole, Mail } from "lucide-react";
export function Login({ configured }: { configured: boolean }) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState("");
  const [stage, setStage] = useState<"identity" | "code">("identity"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/auth/${stage === "identity" ? "request" : "verify"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            displayName: name,
            email,
            ...(stage === "code" ? { code } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ??
            "認証できませんでした。時間をおいてお試しください。",
        );
      if (stage === "identity") setStage("code");
      else window.location.replace(result.approved ? "/" : "/account");
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
              認証サービスの接続後に利用できます。現在、確認メールの送信と社内画面へのログインはできません。
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
              readOnly={stage === "code"}
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
              readOnly={stage === "code"}
              placeholder="name@example.com"
            />
          </label>
          {stage === "code" && (
            <>
              <p className="auth-code-note">
                メールに届いた確認コードを入力してください。
              </p>
              <label>
                確認コード
                <input
                  name="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6,10}"
                  required
                  minLength={6}
                  maxLength={10}
                />
              </label>
            </>
          )}
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
            {busy ? (
              "確認中…"
            ) : stage === "identity" ? (
              <>
                <Mail size={18} />
                確認コードをメールで受け取る
              </>
            ) : (
              <>
                本人確認してログイン
                <ArrowRight size={18} />
              </>
            )}
          </button>
          {stage === "code" && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setStage("identity");
                setCode("");
                setError("");
              }}
            >
              氏名・メールアドレスを入力し直す
            </button>
          )}
        </form>
        <p className="auth-footnote">
          初回はメールでの本人確認後、管理者の承認が必要です。役職・所属店舗・権限は管理者が設定します。
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
