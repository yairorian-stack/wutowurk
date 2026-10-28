"use client";
import type { SharedSalesState } from "@/lib/shared-sales";
import { salesDateLabel } from "@/lib/imported-sales";
import { yen } from "@/lib/finance";
const dateTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
export function SharedCashbook({ shared, scope }: { shared: SharedSalesState; scope: string }) {
  return <>
    <section className="panel" aria-label="自動取込の状況">
      <p>最終更新日時：{shared.sync?.last_success_at ? dateTime(shared.sync.last_success_at) : "定期取込の開始待ち"}（日本時間）</p>
      <p role="status">{shared.sync?.status === "failed" ? "取込失敗：前回の正常な実績を表示しています。管理者による確認が必要です。" : shared.sync?.last_success_at ? "売上・本店出納帳の取込成功。一部確認待ちがあります。" : "登録済みの実績を表示しています。毎日の自動更新は接続設定後に開始します。"}</p>
      {shared.cashUnavailable && <p role="alert">本店出納帳を読み込めませんでした。残高を0円として表示していません。</p>}
    </section>
    <section className="panel" aria-labelledby="cashbook-status-title">
      <p className="eyebrow">CASHBOOK</p><h2 id="cashbook-status-title">現金出納帳</h2>
      {scope !== "honten" && <p role="status">羽ノ浦店の出納帳は原本の年度確認待ちです。2026年の実績としては取り込んでいません。</p>}
      {scope !== "816" && (shared.cash ? <>
        <p>本店・{shared.cash.month.slice(0,7)}／前月繰越・開始残高 {yen(shared.cash.opening_jpy)}</p>
        <p className="small muted">原本の記載どおりの入出金・残高です。「売上」とキャッシュレス控除の行を合わせて確認します。銀行への入金は店舗現金からの出金です。実際に数えた現金との過不足は未照合です。</p>
        <div className="local-table-scroll"><table className="local-table"><caption>本店現金出納帳（原本照合済み）</caption><thead><tr>{["日付","科目","概要","入金","出金","残高"].map(v=><th key={v} scope="col">{v}</th>)}</tr></thead><tbody>
          {shared.cash.rows.map(r=><tr key={r.source_order}><th scope="row"><time dateTime={r.transaction_date}>{salesDateLabel(r.transaction_date)}</time></th><td>{r.category}</td><td>{r.description}</td><td>{r.receipt_jpy ? yen(r.receipt_jpy) : "—"}</td><td>{r.payment_jpy ? yen(r.payment_jpy) : "—"}</td><td>{yen(r.balance_jpy)}</td></tr>)}
        </tbody></table></div>
      </> : <p>本店出納帳は取込準備中です。開始残高・入出金明細の接続と照合が完了すると表示されます。残高は未照合です。</p>)}
    </section>
  </>;
}
