"use client";
import { useState } from "react";
import { Database, FlaskConical, Info } from "lucide-react";
import { stores, type StoreId } from "@/lib/domain";

const SAMPLE_SESSION_KEY = "wuto-wurk-finance-sample-session-v1";
function sampleIsOpen() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SAMPLE_SESSION_KEY) === "open";
  } catch {
    return false;
  }
}

export function FinanceDataMode({
  scope,
  children,
}: {
  scope: StoreId | "all";
  children: React.ReactNode;
}) {
  const [sample, setSample] = useState(sampleIsOpen);
  function chooseSample(open: boolean) {
    try {
      if (open) sessionStorage.setItem(SAMPLE_SESSION_KEY, "open");
      else sessionStorage.removeItem(SAMPLE_SESSION_KEY);
    } catch {
      // An unavailable session store must not prevent closing the preview.
    }
    setSample(open);
  }
  if (sample)
    return (
      <>
        <div className="finance-source-banner" role="status">
          <FlaskConical size={22} />
          <div>
            <strong>確認用データを表示しています</strong>
            <p>
              表示中の累計売上・現金残高・前年比は、店舗の実績として照合されていません。
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => chooseSample(false)}
          >
            サンプルを閉じる
          </button>
        </div>
        {children}
      </>
    );
  const storeName =
    scope === "all" ? "全店舗" : stores.find((s) => s.id === scope)!.short;
  return (
    <>
      <div className="page-intro finance-intro">
        <div>
          <p className="eyebrow">SALES / DAILY REPORT / CASHBOOK</p>
          <h1>売上・日報・現金出納帳</h1>
          <p className="muted">{storeName}のデータ接続状況</p>
        </div>
      </div>
      <section
        className="panel finance-not-connected"
        aria-labelledby="finance-connection-title"
      >
        <div className="finance-connection-heading">
          <Database size={30} />
          <div>
            <span className="finance-connection-badge">実データ未取込</span>
            <h2 id="finance-connection-title">
              実際の売上は、まだ集計されていません。
            </h2>
          </div>
        </div>
        <p>
          この確認用サイトには、店舗の出納帳・売上データが接続されていません。スプレッドシートの数値との照合も未完了です。
        </p>
        <dl className="finance-unavailable-values">
          <div>
            <dt>累計売上</dt>
            <dd>未集計</dd>
          </div>
          <div>
            <dt>総労働時間・人時売上高</dt>
            <dd>未集計</dd>
          </div>
          <div>
            <dt>現金出納帳の残高</dt>
            <dd>未照合</dd>
          </div>
        </dl>
        <p className="finance-connection-note">
          <Info size={18} />
          <span>
            未取込は「売上0円」ではありません。実データの取込・照合後に、実績として表示します。
          </span>
        </p>
        <div className="finance-sample-choice">
          <div>
            <h3>入力や目標管理を試す</h3>
            <p>
              架空のサンプルと、このブラウザーで保存した確認用の記録を開きます。保存済みの記録はそのまま保持しています。
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => chooseSample(true)}
          >
            <FlaskConical size={17} />
            サンプルで操作を試す
          </button>
        </div>
        <p className="small muted">
          実際の店舗データを扱うには、個人ログイン・非公開の保存先・バックアップが必要です。
        </p>
      </section>
    </>
  );
}
