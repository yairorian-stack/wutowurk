"use client";
import type { SharedCashRow, SharedSalesState } from "@/lib/shared-sales";
import { salesDateLabel } from "@/lib/imported-sales";
import { yen } from "@/lib/finance";
const dateTime=(value:string)=>new Intl.DateTimeFormat("ja-JP",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Tokyo"}).format(new Date(value));
const storeName=(id:string)=>id==="honten"?"本店":"羽ノ浦店";
const dateRowSpan=(rows:SharedCashRow[],index:number)=>{
  if(index>0&&rows[index-1].transaction_date===rows[index].transaction_date)return 0;
  let end=index+1;
  while(end<rows.length&&rows[end].transaction_date===rows[index].transaction_date)end++;
  return end-index;
};
export function SharedCashbook({shared,scope}:{shared:SharedSalesState;scope:string}){
  const months=(shared.cashMonths??[]).filter(m=>scope==="all" || m.store_id===scope);
  const statuses=(shared.cashStatuses??[]).filter(m=>scope==="all" || m.store_id===scope);
  return <>
    <section className="panel" aria-label="自動取込の状況">
      <p>最終更新日時：{shared.sync?.last_success_at?dateTime(shared.sync.last_success_at):"定期取込の開始待ち"}（日本時間）</p>
      <p role="status">{shared.sync?.status==="failed"?"取込失敗：前回の正常な実績を表示しています。管理者による確認が必要です。":shared.sync?.last_success_at?"売上の取込成功。出納帳は店舗・月ごとの結果をご確認ください。":"登録済みの実績を表示しています。毎日の自動更新は接続設定後に開始します。"}</p>
      {shared.cashUnavailable&&<p role="alert">一部の出納帳を読み込めませんでした。残高を0円として表示していません。</p>}
    </section>
    <section className="panel" aria-labelledby="cashbook-status-title">
      <p className="eyebrow">CASHBOOK</p><h2 id="cashbook-status-title">現金出納帳</h2>
      {statuses.map(s=><p key={`${s.store_id}/${s.month}`} role="status">
        {storeName(s.store_id)}・{s.month.slice(0,7)}：{s.status==="success"?"取込成功・営業日報照合済み":s.status==="blocked"?"原本の月・残高確認待ち（非公開）":s.message_code==="SALES_MISMATCH"?"営業日報の売上と不一致。":"原本の残高・取込状態の確認が必要です。"}
        {s.status==="failed"&&(s.last_success_at?"前回の正常値を表示しています。":"新しい明細の公開を停止しています。")}
        {s.last_success_at&&<span>（前回成功：<time dateTime={s.last_success_at}>{dateTime(s.last_success_at)}</time>）</span>}
      </p>)}
      {months.map(month=>{
        const label=storeName(month.store_id);
        const verified=statuses.find(s=>s.store_id===month.store_id&&s.month===month.month)?.last_success_at;
        return <div key={`${month.store_id}/${month.month}`}>
          <h3>{label}・{month.month.slice(0,7)}</h3>
          <p>前月繰越・開始残高 {yen(month.opening_jpy)}</p>
          <p className="small muted">原本の入出金・残高を表示しています。銀行への入金は店舗現金からの出金です。実際に数えた現金との過不足は未照合です。</p>
          <div className="local-table-scroll"><table className="local-table"><caption>{label}現金出納帳・{month.month.slice(0,7)}（{verified?"前回成功時点の照合済み明細":"営業日報との照合待ち"}）</caption><thead><tr>{["日付","科目","概要","入金","出金","残高"].map(v=><th key={v} scope="col">{v}</th>)}</tr></thead><tbody>
            {month.rows.map((r,index)=>{
              const span=dateRowSpan(month.rows,index);
              return <tr key={r.source_order}>{span>0&&<th className="cash-date-group" scope="rowgroup" rowSpan={span}><time dateTime={r.transaction_date}>{salesDateLabel(r.transaction_date)}</time></th>}<td>{r.category}</td><td>{r.description}</td><td>{r.receipt_jpy?yen(r.receipt_jpy):"—"}</td><td>{r.payment_jpy?yen(r.payment_jpy):"—"}</td><td>{yen(r.balance_jpy)}</td></tr>;
            })}
          </tbody></table></div>
        </div>;
      })}
      {!months.length&&<p>選択店舗の出納帳は取込準備中、または原本確認待ちです。接続と照合が完了した月から表示します。</p>}
    </section>
  </>;
}
