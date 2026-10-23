"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  History,
  Info,
  LockKeyhole,
  NotebookPen,
  Pencil,
  Plus,
  Settings2,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { stores, today, type Session, type StoreId } from "@/lib/domain";
import {
  balanceAt,
  cashCategoryLabel,
  canUseFinance,
  cumulative,
  hours,
  ledger,
  monthDays,
  monthSchema,
  monthShift,
  monthlySummary,
  yen,
  type CashMovement,
  type FinanceAudit,
  type FinanceState,
} from "@/lib/finance";
import { financeIssue, useFinance } from "@/lib/finance-store";
import {
  CashEditor,
  DailyEditor,
  OpeningEditor,
  ReportValues,
  VoidCashDialog,
} from "./finance-editors";
import { Dialog } from "./dialog";
import { csvText } from "@/lib/csv";
import { Empty } from "./ui";
import { MonthlyTargets, MonthlyTargetEditor } from "./finance-targets";
import { FinanceDataMode } from "./finance-data-mode";

type Props = {
  session: Session;
  scope: StoreId | "all";
  selectStore: (s: StoreId) => void;
  notify: (s: string) => void;
};
type Modal =
  | { kind: "daily"; date: string }
  | { kind: "cash"; id?: string }
  | { kind: "opening" }
  | { kind: "void"; movement: CashMovement }
  | { kind: "history" }
  | { kind: "target"; storeId: StoreId }
  | null;
export function Finance(props: Props) {
  if (
    !canUseFinance(props.session) ||
    (props.scope !== "all" && !canUseFinance(props.session, props.scope))
  )
    return (
      <section className="panel finance-restricted">
        <LockKeyhole size={34} />
        <h1>売上・日報・現金出納帳</h1>
        <p>店舗管理者以上のプレビューで利用できます。</p>
        <p className="small muted">
          店舗管理者は所属店、全社・システム管理者は全店を確認する設計です。
        </p>
      </section>
    );
  return (
    <FinanceDataMode scope={props.scope}>
      <FinanceWorkspace {...props} />
    </FinanceDataMode>
  );
}
function FinanceWorkspace({ session, scope, selectStore, notify }: Props) {
  const state = useFinance();
  const [month, setMonth] = useState(today().slice(0, 7)),
    [tab, setTab] = useState<"monthly" | "reports" | "cash">("monthly"),
    [modal, setModal] = useState<Modal>(null);
  const ids: StoreId[] = scope === "all" ? stores.map((s) => s.id) : [scope];
  const summary = monthlySummary(state, ids, month);
  const reports = state.reports
    .filter((r) => ids.includes(r.storeId) && r.date.startsWith(month))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.storeId.localeCompare(b.storeId),
    );
  const storeId = scope === "all" ? session.storeId : scope;
  function openDaily(date = today()) {
    setModal({ kind: "daily", date });
  }
  function saved(message: string) {
    notify(message);
  }
  function csv(kind: "reports" | "cash") {
    if (kind === "reports")
      downloadCsv(
        `確認用-日報-${scope}-${month}.csv`,
        [
          "データ区分",
          "店舗",
          "日付",
          "営業状況",
          "現金売上（税込円）",
          "キャッシュレス売上（税込円）",
          "総売上（税込円）",
          "総労働時間（分）",
          "振り返り",
          "確認現金残高（円）",
          "割引券使用枚数（枚）",
          "割引券割引額（円）",
        ],
        reports.map((r) => [
          "確認用（実績未照合）",
          storeName(r.storeId),
          r.date,
          r.businessStatus,
          r.cashSales,
          r.cashlessSales,
          r.cashSales + r.cashlessSales,
          r.laborMinutes,
          r.memo,
          r.countedCash ?? "",
          r.voucherCount ?? "",
          r.voucherDiscount ?? "",
        ]),
      );
    else if (scope !== "all") {
      const rows = ledger(state, scope).filter((r) => r.date.startsWith(month));
      downloadCsv(
        `確認用-現金出納帳-${scope}-${month}.csv`,
        [
          "データ区分",
          "店舗",
          "日付",
          "区分",
          "摘要",
          "入金（円）",
          "出金（円）",
          "計算残高（円）",
          "記録元",
          "レシート金額（参考円）",
          "レシート摘要",
          "割引券使用枚数（枚）",
          "割引券割引額（円）",
        ],
        [
          [
            "確認用（実績未照合）",
            storeName(scope),
            `${month}-01`,
            "月初繰越",
            "",
            0,
            0,
            balanceAt(state, scope, `${month}-01`, true) ?? "未開始",
            "",
            "",
            "",
            "",
            "",
          ],
          ...rows.map((r) => [
            "確認用（実績未照合）",
            storeName(scope),
            r.date,
            r.category,
            r.description,
            r.receipt,
            r.payment,
            r.balance,
            r.source,
            r.movement?.receiptAmount ?? "",
            r.movement?.receiptDescription ?? "",
            "",
            "",
          ]),
          ...reports
            .filter((r) => r.voucherCount != null && r.voucherDiscount != null)
            .map((r) => [
              "確認用（実績未照合）",
              storeName(scope),
              r.date,
              "割引券（参考）",
              "現金残高・売上には再計上しません",
              0,
              0,
              "",
              "日報",
              "",
              "",
              r.voucherCount!,
              r.voucherDiscount!,
            ]),
        ],
      );
    }
  }
  return (
    <>
      <div className="page-intro finance-intro">
        <div>
          <p className="eyebrow">A GOOD DAY, ONE RECORD AT A TIME.</p>
          <h1>売上・日報・現金出納帳</h1>
          <p className="muted">
            1日の記録から、店舗の「いま」と「これから」を見つける。
          </p>
        </div>
        {scope !== "all" && (
          <button className="button primary" onClick={() => openDaily()}>
            <NotebookPen size={18} />
            日報を入力
          </button>
        )}
      </div>
      <div className="finance-demo-note">
        <Info size={20} />
        <div>
          <strong>実績データの取込・照合は未完了です</strong>
          <p>
            実際の売上・帳簿・社内情報は入力しないでください。記録はこのブラウザー内のみで保存され、店舗間・端末間では共有されません。
          </p>
        </div>
      </div>
      {financeIssue() && (
        <p role="alert" className="form-error">
          {financeIssue()}
        </p>
      )}
      <div
        className="finance-tabs"
        role="tablist"
        aria-label="売上・日報の表示"
      >
        {(
          [
            ["monthly", "月次進捗・前年比"],
            ["reports", "日報一覧"],
            ["cash", "現金出納帳"],
          ] as const
        ).map(([key, label]) => (
          <button
            role="tab"
            aria-label={label}
            aria-selected={tab === key}
            aria-controls={`finance-${key}`}
            id={`finance-tab-${key}`}
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? "active" : ""}
          >
            {key === "monthly" ? (
              <CalendarDays size={17} />
            ) : key === "cash" ? (
              <Wallet size={17} />
            ) : (
              <NotebookPen size={17} />
            )}
            <span>{key === "monthly" ? "月次進捗" : label}</span>
          </button>
        ))}
      </div>
      <div className="panel finance-month-bar">
        <div>
          <button
            className="icon-button"
            aria-label="前の月"
            onClick={() => setMonth(monthShift(month, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <label>
            <span className="sr-only">集計する月</span>
            <input
              aria-label="集計する月"
              type="month"
              min="1901-01"
              max="2199-12"
              value={month}
              onChange={(e) => {
                if (monthSchema.safeParse(e.target.value).success)
                  setMonth(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="次の月"
            onClick={() => setMonth(monthShift(month, 1))}
          >
            <ChevronRight size={20} />
          </button>
          {month !== today().slice(0, 7) && (
            <button
              className="text-button"
              onClick={() => setMonth(today().slice(0, 7))}
            >
              今月に戻る
            </button>
          )}
        </div>
        <button
          className="text-button"
          onClick={() => setModal({ kind: "history" })}
        >
          <History size={16} />
          記録の変更履歴
        </button>
      </div>
      <div
        id={`finance-${tab}`}
        role="tabpanel"
        aria-labelledby={`finance-tab-${tab}`}
      >
        {tab === "monthly" && (
          <>
            <MonthlyTargets
              state={state}
              ids={ids}
              month={month}
              edit={(storeId) => setModal({ kind: "target", storeId })}
            />
            <div className="finance-period">
              <CalendarDays size={17} />
              <div>
                <strong>
                  {summary.current.days
                    ? `${month}-01 〜 ${month}-${String(summary.current.days).padStart(2, "0")}`
                    : "この月はまだ到来していません"}
                </strong>
                <p>
                  比較：{summary.prior.month}-01 〜{" "}
                  {summary.prior.days
                    ? String(summary.prior.days).padStart(2, "0")
                    : "—"}
                  日 /{" "}
                  {month === today().slice(0, 7)
                    ? "今月は今日と同じ日まで"
                    : "過去月は月全体"}
                </p>
              </div>
              <span>{scope === "all" ? "全社合計" : storeName(scope)}</span>
            </div>
            <div className="finance-kpis">
              <Kpi
                label="確認用の累計売上（税込）"
                value={yen(summary.current.sales)}
                prior={yen(summary.prior.sales)}
                change={summary.salesChange}
                comparable={summary.comparable}
                zeroPrior={summary.prior.sales === 0}
              />
              <Kpi
                label="累計総労働時間"
                value={hours(summary.current.minutes)}
                prior={hours(summary.prior.minutes)}
                change={summary.laborChange}
                comparable={summary.comparable}
                zeroPrior={summary.prior.minutes === 0}
              />
              <Kpi
                label="人時売上高"
                value={
                  summary.current.productivity == null
                    ? "—"
                    : yen(summary.current.productivity)
                }
                prior={
                  summary.prior.productivity == null
                    ? "—"
                    : yen(summary.prior.productivity)
                }
                description="総売上 ÷ 全員の総労働時間。未入力を含む期間は参考値です。"
              />
            </div>
            <div
              className={`comparison-readiness ${summary.comparable ? "ready" : "incomplete"}`}
            >
              <div>
                <span>
                  {summary.comparable
                    ? "比較期間の入力が揃っています"
                    : "未入力を0として比較しません"}
                </span>
                <p>
                  本年 {summary.current.reports.length}/
                  {summary.current.expected} 件 ・ 前年{" "}
                  {summary.prior.reports.length}/{summary.prior.expected}{" "}
                  件（休業日も0円の日報を登録）
                </p>
              </div>
              {!summary.comparable && (
                <details>
                  <summary>未入力日を確認</summary>
                  <div>
                    {(
                      [
                        ["本年", summary.current],
                        ["前年", summary.prior],
                      ] as const
                    ).map(([label, period]) => (
                      <section key={label}>
                        <strong>{label}</strong>
                        {period.missing.length ? (
                          <p>
                            {period.missing
                              .map((m) => `${storeName(m.storeId)} ${m.date}`)
                              .join(" ／ ")}
                          </p>
                        ) : (
                          <p>{period.days ? "未入力なし" : "対象期間なし"}</p>
                        )}
                      </section>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <MonthlyChart
              state={state}
              ids={ids}
              month={month}
              cutoff={summary.current.days}
            />
            <section className="finance-store-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">OUR STORES</p>
                  <h2>店舗ごとの進捗</h2>
                </div>
                <span className="small muted">同じ期間で、昨年と比べる。</span>
              </div>
              <div className="finance-store-grid">
                {ids.map((id) => {
                  const s = monthlySummary(state, [id], month);
                  return (
                    <article className="panel finance-store-card" key={id}>
                      <h3>
                        <Store size={18} />
                        {storeName(id)}
                      </h3>
                      <dl>
                        <div>
                          <dt>売上</dt>
                          <dd>{yen(s.current.sales)}</dd>
                        </div>
                        <div>
                          <dt>前年同期間</dt>
                          <dd>{yen(s.prior.sales)}</dd>
                        </div>
                        <div>
                          <dt>総労働時間</dt>
                          <dd>{hours(s.current.minutes)}</dd>
                        </div>
                        <div>
                          <dt>前年同期間</dt>
                          <dd>{hours(s.prior.minutes)}</dd>
                        </div>
                      </dl>
                      <p>
                        {s.comparable
                          ? `売上 ${changeText(s.salesChange)} ／ 労働時間 ${changeText(s.laborChange)}`
                          : "記録が不足しているため、前年比は未算出です。"}
                      </p>
                      {scope === "all" && (
                        <button
                          className="text-button"
                          onClick={() => selectStore(id)}
                        >
                          この店舗の記録を開く
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {tab === "reports" && (
          <>
            <div className="finance-list-heading">
              <div>
                <h2>1日ずつの、成長の記録</h2>
                <p>{reports.length} 件 / 日付の新しい順</p>
              </div>
              <button
                className="button secondary"
                onClick={() => csv("reports")}
              >
                <Download size={16} />
                CSV保存
              </button>
            </div>
            {reports.length ? (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <caption className="sr-only">店舗別の日報一覧</caption>
                  <thead>
                    <tr>
                      <th scope="col">日付・店舗</th>
                      <th scope="col">売上（税込）</th>
                      <th scope="col">総労働時間</th>
                      <th scope="col">メモ・振り返り</th>
                      <th scope="col">現金差異</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => {
                      const expected = balanceAt(state, r.storeId, r.date),
                        diff =
                          r.countedCash != null && expected != null
                            ? r.countedCash - expected
                            : null;
                      return (
                        <tr key={r.id}>
                          <th scope="row">
                            <strong>{r.date}</strong>
                            <span>
                              {storeName(r.storeId)} / {r.businessStatus}
                            </span>
                          </th>
                          <td>
                            <strong>
                              {yen(r.cashSales + r.cashlessSales)}
                            </strong>
                            <span>
                              現金 {yen(r.cashSales)}
                              <br />
                              キャッシュレス {yen(r.cashlessSales)}
                            </span>
                          </td>
                          <td className="numeric">{hours(r.laborMinutes)}</td>
                          <td className="report-memo">
                            <p>{r.memo || "記入なし"}</p>
                          </td>
                          <td
                            className={
                              diff != null && diff !== 0
                                ? "cash-mismatch"
                                : "muted"
                            }
                          >
                            {diff == null
                              ? "未確認"
                              : diff === 0
                                ? "一致"
                                : `${diff > 0 ? "+" : ""}${yen(diff)}`}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              aria-label={`${r.date} ${storeName(r.storeId)}の日報を編集`}
                              onClick={() => {
                                selectStore(r.storeId);
                                setModal({ kind: "daily", date: r.date });
                              }}
                            >
                              <Pencil size={15} />
                              編集
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel">
                <Empty title="この月の日報はまだありません">
                  日報を入力すると、売上と労働時間が月次進捗に反映されます。
                </Empty>
              </div>
            )}
            <p className="gentle-note">
              総労働時間はスタッフ全員分の合計です。休業日でも研修等の勤務時間は記録できます。
            </p>
          </>
        )}
        {tab === "cash" &&
          (scope === "all" ? (
            <div className="panel">
              <Empty title="出納帳は店舗ごとに管理します">
                ヘッダーまたは下のボタンから店舗を選んでください。
              </Empty>
              <div className="cash-store-choices">
                {stores.map((s) => (
                  <button
                    key={s.id}
                    className="button secondary"
                    onClick={() => selectStore(s.id)}
                  >
                    {s.short}
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Cashbook
              state={state}
              storeId={scope}
              month={month}
              openDaily={openDaily}
              edit={(id) => setModal({ kind: "cash", id })}
              cancel={(movement) => setModal({ kind: "void", movement })}
              opening={() => setModal({ kind: "opening" })}
              csv={() => csv("cash")}
            />
          ))}
      </div>
      {modal?.kind === "daily" && (
        <DailyEditor
          key={`${storeId}-${modal.date}`}
          report={state.reports.find(
            (r) => r.storeId === storeId && r.date === modal.date,
          )}
          movements={state.movements.filter(
            (m) => m.storeId === storeId && m.date === modal.date && !m.voided,
          )}
          target={state.targets.find(
            (t) => t.storeId === storeId && t.month === modal.date.slice(0, 7),
          )}
          storeId={storeId}
          date={modal.date}
          changeDate={(date) => setModal({ kind: "daily", date })}
          session={session}
          close={() => setModal(null)}
          saved={() =>
            saved("日報を保存しました。月次進捗と出納帳に反映しました")
          }
        />
      )}
      {modal?.kind === "cash" && (
        <CashEditor
          movement={state.movements.find((m) => m.id === modal.id)}
          storeId={storeId}
          date={month === today().slice(0, 7) ? today() : `${month}-01`}
          session={session}
          close={() => setModal(null)}
          saved={() => saved("現金明細を保存しました")}
        />
      )}
      {modal?.kind === "target" && (
        <MonthlyTargetEditor
          key={`${modal.storeId}-${month}`}
          target={state.targets.find(
            (t) => t.storeId === modal.storeId && t.month === month,
          )}
          previous={state.targets.find(
            (t) =>
              t.storeId === modal.storeId && t.month === monthShift(month, -1),
          )}
          storeId={modal.storeId}
          month={month}
          session={session}
          close={() => setModal(null)}
          saved={() =>
            saved("月次目標を保存しました。日報の実績から進捗を自動計算します")
          }
        />
      )}
      {modal?.kind === "opening" && (
        <OpeningEditor
          opening={state.openings.find((o) => o.storeId === storeId)}
          storeId={storeId}
          session={session}
          close={() => setModal(null)}
          saved={() => saved("出納帳の開始残高を保存しました")}
        />
      )}
      {modal?.kind === "void" && (
        <VoidCashDialog
          movement={modal.movement}
          session={session}
          close={() => setModal(null)}
          saved={() => saved("理由を記録し、現金明細を取り消しました")}
        />
      )}
      {modal?.kind === "history" && (
        <FinanceHistory
          items={state.history.filter((h) => ids.includes(h.storeId))}
          close={() => setModal(null)}
        />
      )}
    </>
  );
}
function storeName(id: StoreId) {
  return stores.find((s) => s.id === id)?.short ?? id;
}
function changeText(rate: number | null) {
  return rate == null ? "前年0のため率なし" : `${rate > 0 ? "+" : ""}${rate}%`;
}
function Kpi({
  label,
  value,
  prior,
  change,
  comparable,
  zeroPrior,
  description,
}: {
  label: string;
  value: string;
  prior: string;
  change?: number | null;
  comparable?: boolean;
  zeroPrior?: boolean;
  description?: string;
}) {
  return (
    <article className="panel finance-kpi">
      <h2>{label}</h2>
      <strong>{value}</strong>
      <p>
        前年同期間 <span>{prior}</span>
      </p>
      {description ? (
        <small>{description}</small>
      ) : (
        <span className="finance-yoy">
          {!comparable
            ? "記録不足・未到来のため前年比未算出"
            : zeroPrior
              ? "前年0のため増減率は算出しません"
              : `前年より ${changeText(change ?? null)}`}
        </span>
      )}
    </article>
  );
}
function MonthlyChart({
  state,
  ids,
  month,
  cutoff,
}: {
  state: FinanceState;
  ids: StoreId[];
  month: string;
  cutoff: number;
}) {
  const [metric, setMetric] = useState<"sales" | "labor">("sales");
  const prior = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const current = cumulative(state, ids, month, cutoff, metric),
    previous = cumulative(state, ids, prior, cutoff, metric);
  const max = Math.max(
    1,
    ...current.filter((v): v is number => v !== null),
    ...previous.filter((v): v is number => v !== null),
  );
  const width = 800,
    height = 220,
    left = 78,
    right = 25,
    top = 22,
    bottom = 38,
    days = monthDays(month);
  const point = (v: number, i: number) => [
    left + (i / Math.max(1, days - 1)) * (width - left - right),
    height - bottom - (v / max) * (height - top - bottom),
  ];
  function path(values: (number | null)[]) {
    return values
      .map((v, i) =>
        v == null ? "" : `${i === 0 ? "M" : "L"}${point(v, i).join(",")}`,
      )
      .join(" ");
  }
  const label = (v: number) =>
    metric === "sales"
      ? v >= 10000
        ? `${Math.round(v / 1000) / 10}万円`
        : yen(v)
      : `${Math.round(v / 60)}時間`;
  return (
    <section className="panel finance-chart">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MONTHLY PROGRESS</p>
          <h2>日々の積み重ねを、見える形に。</h2>
        </div>
        <div className="chart-metric">
          <button
            aria-pressed={metric === "sales"}
            onClick={() => setMetric("sales")}
          >
            売上
          </button>
          <button
            aria-pressed={metric === "labor"}
            onClick={() => setMetric("labor")}
          >
            労働時間
          </button>
        </div>
      </div>
      <div className="chart-legend">
        <span>
          <i />
          本年の累計
        </span>
        <span>
          <i />
          前年の累計
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="monthly-chart-title monthly-chart-description"
      >
        <title id="monthly-chart-title">
          {month}の累計{metric === "sales" ? "売上" : "総労働時間"}と前年の比較
        </title>
        <desc id="monthly-chart-description">
          累計線は、月初から記録が連続する日まで表示します。未入力日以降の線は表示しません。数値は集計カードと日報一覧で確認できます。
        </desc>
        {[0, 0.5, 1].map((scale) => {
          const y = height - bottom - scale * (height - top - bottom);
          return (
            <g key={scale}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#e3e8da"
                strokeDasharray="3 5"
              />
              <text
                x={left - 12}
                y={y + 4}
                textAnchor="end"
                fill="#7c886e"
                fontSize={11}
              >
                {label(max * scale)}
              </text>
            </g>
          );
        })}
        {[1, 7, 14, 21, days].map((d) => (
          <text
            key={d}
            x={point(0, d - 1)[0]}
            y={height - 12}
            fill="#7c886e"
            textAnchor="middle"
            fontSize={11}
          >
            {d}日
          </text>
        ))}
        <path
          d={path(previous)}
          fill="none"
          stroke="#bc9470"
          strokeWidth={2.5}
          strokeDasharray="6 5"
        />
        <path d={path(current)} fill="none" stroke="#5c7d45" strokeWidth={3} />
        {current.map((v, i) =>
          v == null ? null : (
            <circle
              key={i}
              cx={point(v, i)[0]}
              cy={point(v, i)[1]}
              r={3}
              fill="#5c7d45"
            >
              <title>
                {i + 1}日：{label(v)}
              </title>
            </circle>
          ),
        )}
      </svg>
      {!current.some((v) => v !== null) && (
        <p className="chart-empty">
          月初からの記録が揃うと、累計線が表示されます。
        </p>
      )}
      <p className="sample-footnote">
        <CircleHelp size={14} />
        累計線は月初から入力が連続する日まで。未入力日以降は推定せず表示を止めます。
      </p>
    </section>
  );
}
function Cashbook({
  state,
  storeId,
  month,
  openDaily,
  edit,
  cancel,
  opening,
  csv,
}: {
  state: FinanceState;
  storeId: StoreId;
  month: string;
  openDaily: (d: string) => void;
  edit: (id?: string) => void;
  cancel: (m: CashMovement) => void;
  opening: () => void;
  csv: () => void;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const rows = ledger(state, storeId).filter((r) => r.date.startsWith(month));
  const initial = balanceAt(state, storeId, `${month}-01`, true),
    closing = balanceAt(
      state,
      storeId,
      `${month}-${String(monthDays(month)).padStart(2, "0")}`,
    );
  const receipts = rows.reduce((s, r) => s + r.receipt, 0),
    payments = rows.reduce((s, r) => s + r.payment, 0);
  const cancelled = state.movements.filter(
    (m) => m.storeId === storeId && m.date.startsWith(month) && m.voided,
  );
  const reports = state.reports.filter(
    (r) => r.storeId === storeId && r.date.startsWith(month),
  );
  const voucherReports = reports.filter(
    (r) => r.voucherCount != null && r.voucherDiscount != null,
  );
  const usedVouchers = voucherReports.filter(
    (r) => (r.voucherCount ?? 0) > 0 || (r.voucherDiscount ?? 0) > 0,
  );
  const voucherCount = voucherReports.reduce(
    (sum, r) => sum + (r.voucherCount ?? 0),
    0,
  );
  const voucherDiscount = voucherReports.reduce(
    (sum, r) => sum + (r.voucherDiscount ?? 0),
    0,
  );
  return (
    <>
      <div className="finance-list-heading">
        <div>
          <h2>{storeName(storeId)}の現金出納帳</h2>
          <p>現金売上は日報から自動で反映されます。</p>
        </div>
        <div>
          <button className="button secondary" onClick={csv}>
            <Download size={16} />
            CSV保存
          </button>
          <button className="button primary" onClick={() => edit()}>
            <Plus size={17} />
            入出金を記録
          </button>
        </div>
      </div>
      <div className="cash-summary">
        <div>
          <span>月初繰越残高</span>
          <strong>{initial == null ? "未開始" : yen(initial)}</strong>
        </div>
        <div>
          <span>月間入金</span>
          <strong>{yen(receipts)}</strong>
        </div>
        <div>
          <span>月間出金</span>
          <strong>{yen(payments)}</strong>
        </div>
        <div>
          <span>計算現金残高</span>
          <strong>{closing == null ? "未開始" : yen(closing)}</strong>
        </div>
      </div>
      {closing != null && closing < 0 && (
        <p className="form-error" role="alert">
          計算残高がマイナスです。開始残高・未入力の現金売上・入出金の内容を確認してください。
        </p>
      )}
      <div className="cashbook-note">
        <Info size={17} />
        <p>
          銀行入金は店舗現金からの「出金」。釣銭補充は「入金」。売上以外の入金は、月次売上には加算しません。
        </p>
        <button className="text-button" onClick={opening}>
          <Settings2 size={15} />
          開始残高
        </button>
      </div>
      {rows.length ? (
        <div className="finance-table-wrap">
          <table className="finance-table cash-table">
            <caption className="sr-only">現金の入金・出金・残高の明細</caption>
            <thead>
              <tr>
                <th scope="col">日付・区分</th>
                <th scope="col">摘要</th>
                <th scope="col">レシート（参考）</th>
                <th scope="col">入金</th>
                <th scope="col">出金</th>
                <th scope="col">計算残高</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <strong>{r.date}</strong>
                    <span>{r.category}</span>
                  </th>
                  <td>
                    <p>{r.description}</p>
                    <span className="ledger-source">
                      {r.source === "日報" ? "日報から自動" : "手入力"}
                    </span>
                  </td>
                  <td className="receipt-meta">
                    {r.movement?.receiptAmount != null ? (
                      <details>
                        <summary>{yen(r.movement.receiptAmount)}</summary>
                        <p>{r.movement.receiptDescription}</p>
                      </details>
                    ) : (
                      <span>未記録</span>
                    )}
                  </td>
                  <td className="numeric">
                    {r.receipt ? yen(r.receipt) : "—"}
                  </td>
                  <td className="numeric">
                    {r.payment ? yen(r.payment) : "—"}
                  </td>
                  <td
                    className={`numeric ${r.balance < 0 ? "cash-mismatch" : ""}`}
                  >
                    {yen(r.balance)}
                  </td>
                  <td>
                    <div className="ledger-actions">
                      <button
                        className="text-button"
                        aria-label={`${r.date} ${r.category} ${r.description}を編集`}
                        onClick={() =>
                          r.report ? openDaily(r.date) : edit(r.id)
                        }
                      >
                        <Pencil size={14} />
                        {r.report ? "日報を編集" : "編集"}
                      </button>
                      {r.movement && (
                        <button
                          className="text-button"
                          aria-label={`${r.date} ${r.description}を取消`}
                          onClick={() => cancel(r.movement!)}
                        >
                          <X size={14} />
                          取消
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel">
          <Empty title="この月の現金明細はまだありません">
            日報の現金売上、または入出金を登録してください。
          </Empty>
        </div>
      )}
      <div className="cashbook-bottom">
        <p>
          同日内は現金売上、その他の入出金の登録順で表示。月初繰越は過去の記録から自動計算します。
        </p>
        <button
          className="text-button"
          onClick={() => setShowCancelled(!showCancelled)}
        >
          {showCancelled
            ? "取消明細を閉じる"
            : `取消済みの明細（${cancelled.length}件）`}
        </button>
      </div>
      {showCancelled && (
        <div className="panel cancelled-list">
          {cancelled.length ? (
            cancelled.map((m) => (
              <article key={m.id}>
                <span>
                  {m.date} / {cashCategoryLabel(m)} / {yen(m.amount)}
                </span>
                <strong>{m.description}</strong>
                <p>取消理由：{m.voidReason}</p>
              </article>
            ))
          ) : (
            <p className="muted">取消済みの明細はありません。</p>
          )}
        </div>
      )}
      <section className="panel voucher-panel">
        <div className="finance-list-heading">
          <div>
            <p className="eyebrow">VOUCHERS / REFERENCE ONLY</p>
            <h2>割引券の使用記録</h2>
            <p>使用枚数・割引額を、現金の入出金と分けて記録します。</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              openDaily(month === today().slice(0, 7) ? today() : `${month}-01`)
            }
          >
            <NotebookPen size={16} />
            割引券を記録
          </button>
        </div>
        <div className="voucher-summary">
          <div>
            <span>記録済みの使用枚数</span>
            <strong>
              {voucherCount.toLocaleString("ja-JP")}
              <small>枚</small>
            </strong>
          </div>
          <div>
            <span>記録済みの割引額</span>
            <strong>{yen(voucherDiscount)}</strong>
          </div>
        </div>
        <p className="finance-form-hint">
          売上は割引後の金額を入力します。ここに記録した割引額で現金残高を動かしたり、売上から再度差し引いたりしません。
        </p>
        <p className="voucher-coverage">
          割引券記録済み：日報 {voucherReports.length}/{reports.length}{" "}
          件。未記録は「使用なし」とみなしません。
        </p>
        {usedVouchers.length ? (
          <div className="finance-table-wrap">
            <table className="finance-table voucher-table">
              <caption className="sr-only">割引券の使用枚数・割引額</caption>
              <thead>
                <tr>
                  <th scope="col">日付</th>
                  <th scope="col">使用枚数</th>
                  <th scope="col">割引額</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {usedVouchers
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.date}</th>
                      <td>{r.voucherCount}枚</td>
                      <td>{yen(r.voucherDiscount ?? 0)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => openDaily(r.date)}
                        >
                          <Pencil size={14} />
                          記録を編集
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small voucher-empty">
            この月の割引券使用の記録はまだありません。使わなかった日は日報で枚数・金額を両方0にして記録してください。
          </p>
        )}
      </section>
    </>
  );
}
function FinanceHistory({
  items,
  close,
}: {
  items: FinanceAudit[];
  close: () => void;
}) {
  return (
    <Dialog
      title="日報・出納帳・月次目標の変更履歴"
      subtitle="元の内容と、変更・取消の内容を記録します。"
      close={close}
      wide
    >
      {items.length ? (
        <div className="audit-list">
          {items.map((item) => (
            <article key={item.id}>
              <History size={18} />
              <div>
                <h3>
                  {item.operation}
                  <span>
                    {storeName(item.storeId)} / {item.actor}
                  </span>
                </h3>
                <time>
                  {new Date(item.at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </time>
                <details>
                  <summary>変更前後を見る</summary>
                  <div className="finance-audit-pair">
                    <div>
                      <strong>変更前</strong>
                      <FinanceAuditValues data={item.before} />
                    </div>
                    <div>
                      <strong>変更後</strong>
                      <FinanceAuditValues data={item.after} />
                    </div>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="変更履歴はまだありません">
          サンプルの初期記録は含みません。入力・編集・取消をすると記録されます。
        </Empty>
      )}
    </Dialog>
  );
}
function FinanceAuditValues({ data }: { data: FinanceAudit["before"] }) {
  if (!data) return <p>新規登録</p>;
  if ("salesTarget" in data)
    return (
      <dl className="report-values">
        <div>
          <dt>対象月</dt>
          <dd>{data.month}</dd>
        </div>
        <div>
          <dt>月間売上目標</dt>
          <dd>{yen(data.salesTarget)}</dd>
        </div>
        <div>
          <dt>人時売上高目標</dt>
          <dd>{yen(data.productivityTarget)} / 人時</dd>
        </div>
      </dl>
    );
  if ("cashSales" in data) return <ReportValues report={data} />;
  if ("direction" in data)
    return (
      <dl className="report-values">
        <div>
          <dt>日付</dt>
          <dd>{data.date}</dd>
        </div>
        <div>
          <dt>明細</dt>
          <dd>
            {data.direction} / {cashCategoryLabel(data)} / {yen(data.amount)}
          </dd>
        </div>
        <div>
          <dt>摘要</dt>
          <dd>{data.description}</dd>
        </div>
        <div>
          <dt>レシート（金額・摘要）</dt>
          <dd>
            {data.receiptAmount == null
              ? "未記録"
              : `${yen(data.receiptAmount)} / ${data.receiptDescription ?? ""}`}
          </dd>
        </div>
        <div>
          <dt>取消理由</dt>
          <dd>{data.voidReason || "—"}</dd>
        </div>
      </dl>
    );
  return (
    <p>
      {data.date} / 開始残高 {yen(data.amount)}
    </p>
  );
}
function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const blob = new Blob([csvText(headers, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
