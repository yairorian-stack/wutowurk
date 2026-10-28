"use client";
import { SharedCashbook } from "./shared-cashbook";
import { useState } from "react";
import { Database, FlaskConical, Info } from "lucide-react";
import { stores, type StoreId } from "@/lib/domain";
import { yen } from "@/lib/finance";
import { readReportedSales } from "@/lib/reported-sales";
import { ImportedSalesPanel } from "./imported-sales";
import { readInitialSales } from "@/lib/imported-sales";
import { useSharedSales } from "./shared-sales-context";
import {
  ManagerDailyEntry,
  ManagerDailyReportList,
} from "./manager-daily-entry";

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
  const shared = useSharedSales();
  const [reported] = useState(readReportedSales);
  const [hasImported, setHasImported] = useState(
    () => readInitialSales().data !== null,
  );
  const [sample, setSample] = useState(
    () => !reported && !hasImported && sampleIsOpen(),
  );
  function chooseSample(open: boolean) {
    try {
      if (open) sessionStorage.setItem(SAMPLE_SESSION_KEY, "open");
      else sessionStorage.removeItem(SAMPLE_SESSION_KEY);
    } catch {
      // An unavailable session store must not prevent closing the preview.
    }
    setSample(open);
  }
  if (shared) return <>
    <div className="page-intro finance-intro"><div><p className="eyebrow">SALES / DAILY REPORT / CASHBOOK</p><h1>売上・日報・現金出納帳</h1><p className="muted">提供された実績の確認</p></div></div>
    <ManagerDailyEntry shared={shared} scope={scope} />
    {shared.status === "ready" ? <ImportedSalesPanel scope={scope} onAvailable={setHasImported} sharedData={shared.data} /> :
      <section className="panel"><h2>{shared.status === "pending" ? "実績データの反映準備中です" : "実績データを読み込めませんでした"}</h2><p>管理者へお問い合わせいただくか、時間をおいて再読み込みしてください。売上0円を示すものではありません。</p></section>}
    <ManagerDailyReportList shared={shared} scope={scope} />
    <SharedCashbook shared={shared} scope={scope} />
  </>;
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
  const reportedAmount = reported?.stores
    .filter((s) => scope === "all" || s.store_id === scope)
    .reduce((sum, s) => sum + s.sales_jpy, 0);
  return (
    <>
      <div className="page-intro finance-intro">
        <div>
          <p className="eyebrow">SALES / DAILY REPORT / CASHBOOK</p>
          <h1>売上・日報・現金出納帳</h1>
          <p className="muted">
            {storeName}の
            {reported || hasImported ? "売上記録" : "データ連携状況"}
          </p>
        </div>
      </div>
      <ImportedSalesPanel scope={scope} onAvailable={setHasImported} />
      {!hasImported && (
        <section
          className="panel finance-not-connected"
          aria-labelledby="finance-connection-title"
        >
          <div className="finance-connection-heading">
            <Database size={30} />
            <div>
              <span className="finance-connection-badge">
                {reported ? "ご提示の月累計" : "ポータル未反映"}
              </span>
              <h2 id="finance-connection-title">
                {reported
                  ? `${reported.month} の売上累計`
                  : "元の集計結果は、まだポータルへ反映されていません。"}
              </h2>
            </div>
          </div>
          <p>
            {reported
              ? `${reported.as_of_sales_date} までの累計です。出典：依頼者提供。日別データとの照合は未完了です。`
              : "スプレッドシート側で集計済みでも、このサイトにはまだ自動反映されません。月累計の転記と、日別出納帳の照合を分けて確認します。"}
          </p>
          <dl className="finance-unavailable-values">
            <div>
              <dt>累計売上</dt>
              <dd className={reported ? "reported-sales-amount" : undefined}>
                {reportedAmount == null ? "未反映" : yen(reportedAmount)}
              </dd>
            </div>
            <div>
              <dt>総労働時間・人時売上高</dt>
              <dd>未取込</dd>
            </div>
            <div>
              <dt>現金出納帳の残高</dt>
              <dd>未照合</dd>
            </div>
          </dl>
          <p className="finance-connection-note">
            <Info size={18} />
            <span>
              {reported
                ? "この月累計を日報や現金入金へ加算する処理は行っていません。労働時間・現金残高は日別データから別途確認します。"
                : "「未反映」は元のシートが未集計、または売上0円という意味ではありません。提供済みの月累計は、日別データと分けて表示できます。"}
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
            日報・出納帳をスタッフ間で共有する本番運用には、個人ログイン・非公開の保存先・バックアップが必要です。
          </p>
        </section>
      )}
      {hasImported && (
        <div className="finance-sample-choice panel">
          <div>
            <h3>サンプルの入力画面</h3>
            <p>上の提供売上とは別の、架空の日報・出納帳を開きます。</p>
          </div>
          <button
            className="button secondary"
            onClick={() => chooseSample(true)}
          >
            サンプルで操作を試す
          </button>
        </div>
      )}
    </>
  );
}
