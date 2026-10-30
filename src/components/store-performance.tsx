"use client";

import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { canRead, shortDate, stores, today, type Session, type StoreId } from "@/lib/domain";
import { yen } from "@/lib/finance";
import { storePerformance } from "@/lib/store-performance";
import { useSharedSales } from "./shared-sales-context";

export function StorePerformance({ session, scope }: { session?: Session; scope: StoreId | "all" }) {
  const shared = useSharedSales();
  if (!shared) return null;
  const date = today();
  const visibleStores = stores.filter((store) =>
    (!session || canRead(session, store.id)) && (scope === "all" || scope === store.id),
  );
  return <section className="panel store-performance" aria-labelledby="store-performance-title">
    <div className="store-performance-heading">
      <div><p className="eyebrow">STORE PERFORMANCE</p><h2 id="store-performance-title"><BarChart3 size={20} />店舗別の売上・人時売上高</h2></div>
      <Link href="/daily" className="text-button">営業日報へ<ArrowRight size={15} /></Link>
    </div>
    <p className="small muted">月の売上は昨年の同じ日付までの累計と比較。今週は月曜〜日曜、前日まで（当日入力済みの場合は当日まで）を集計します。</p>
    {shared.status !== "ready" ? <p role="status">{shared.status === "pending" ? "実績データの反映準備中です。" : "実績データを読み込めませんでした。時間をおいて再読み込みしてください。"}</p> :
      <div className="store-performance-grid">{visibleStores.map((store) => {
        const metrics = storePerformance(shared.data, store.id, date,
          shared.managerReports?.filter((r) => r.store_id === store.id).map((r) => r.report_date));
        return <article className="store-performance-card" key={store.id} aria-label={`${store.short}の売上指標`}>
          <h3><span className={`store-dot ${store.id === "816" ? "orange" : ""}`} />{store.short}</h3>
          <dl>
            <div><dt>{Number(metrics.month.slice(5))}月の昨年度同月比</dt><dd>{metrics.yoy === null ? <span className="performance-pending">未確認</span> : <>{metrics.yoy.toFixed(1)}<small>%</small></>}</dd></div>
            <div><dt>今週の人時売上高</dt><dd>{metrics.salesPerLaborHour === null ? <span className="performance-pending">未集計</span> : <>{yen(Math.round(metrics.salesPerLaborHour))}<small>/人時</small></>}</dd></div>
          </dl>
          <p className="small">{metrics.monthThrough ? `${shortDate(`${metrics.month}-01`)}〜${shortDate(metrics.monthThrough)} 累計売上 ${yen(metrics.monthSales!)}` : "今月の売上は未登録です。"}</p>
          {metrics.overridden && <p className="small muted">日報で修正した実績を含むため、前年対比は再照合待ちです。</p>}
          <div className="performance-week-detail">
            <strong className="small">今週 {shortDate(metrics.weekStart)}〜{shortDate(metrics.weekEnd)}{metrics.weekThrough ? `（${shortDate(metrics.weekThrough)}まで）` : ""}</strong>
            {metrics.salesPerLaborHour !== null ? <p className="small muted">売上 {yen(metrics.sales)} ÷ 労働時間 {(metrics.laborMinutes / 60).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}時間</p> :
              <p className="small muted">{[
                metrics.missingSales ? `売上未登録 ${metrics.missingSales}日` : "",
                metrics.missingLabor ? `労働時間未入力・要確認 ${metrics.missingLabor}日` : "",
                !metrics.missingSales && !metrics.missingLabor ? (metrics.enteredDays ? "労働時間が0のため計算できません。" : "今週の実績入力待ちです。") : "",
              ].filter(Boolean).join(" ／ ")}</p>}
          </div>
        </article>;
      })}</div>}
    <p className="small muted">出典：共有営業日報。未登録・空欄を0として補完しません。労働時間が揃うと「週の売上合計 ÷ 週の総労働時間」で自動計算します。</p>
  </section>;
}
