"use client";
import { useState, type FormEvent } from "react";
import { Check, Copy, Pencil, Target } from "lucide-react";
import { stores, type Session, type StoreId } from "@/lib/domain";
import {
  hours,
  monthShift,
  saveMonthlyTarget,
  yen,
  type FinanceState,
  type MonthlyTarget,
} from "@/lib/finance";
import { monthlyTargetProgress } from "@/lib/finance-targets";
import { updateFinance } from "@/lib/finance-store";
import { Dialog } from "./dialog";

const name = (id: StoreId) => stores.find((s) => s.id === id)!.short;
const percent = (value: number) =>
  `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;

export function MonthlyTargets({
  state,
  ids,
  month,
  edit,
}: {
  state: FinanceState;
  ids: StoreId[];
  month: string;
  edit: (id: StoreId) => void;
}) {
  const p = monthlyTargetProgress(state, ids, month);
  return (
    <section
      className="monthly-targets panel"
      aria-labelledby="monthly-target-title"
    >
      <div className="monthly-target-heading">
        <div>
          <p className="eyebrow">OUR MONTHLY GOALS</p>
          <h2 id="monthly-target-title">
            <Target size={21} />
            {month} の目標と進捗
          </h2>
          <p>日報を保存すると、売上と人時売上高の進捗が自動で更新されます。</p>
        </div>
        {ids.length === 1 && (
          <button className="button secondary" onClick={() => edit(ids[0])}>
            <Pencil size={16} />
            {p.ready ? "月次目標を編集" : "月次目標を設定"}
          </button>
        )}
      </div>
      {p.ready ? (
        <>
          <div className="monthly-target-grid">
            <TargetMetric
              label="月間売上"
              actual={yen(p.current.sales)}
              goal={yen(p.salesTarget!)}
              rate={p.salesPercent}
              unit="目標達成率"
            >
              {p.remainingSales! > 0
                ? `目標まであと ${yen(p.remainingSales!)}`
                : "月間売上目標に届いています"}
            </TargetMetric>
            <TargetMetric
              label="人時売上高"
              actual={
                p.productivity == null
                  ? "未算出"
                  : `${yen(p.productivity)} / 人時`
              }
              goal={`${yen(p.productivityTarget!)} / 人時`}
              rate={p.productivityPercent}
              unit="目標に対する比率"
            >
              総売上 ÷ 全員の総労働時間。
              {p.productivity == null
                ? "労働時間の記録があると算出します。"
                : "月内の入力済み実績で算出します。"}
            </TargetMetric>
          </div>
          <div className="monthly-labor-guide">
            <span>
              月間総労働時間の目安{" "}
              <strong>{hours(p.laborBudgetMinutes!)}</strong>
            </span>
            <span>
              入力済み <strong>{hours(p.current.minutes)}</strong>
            </span>
            <p>
              売上目標 ÷
              人時売上高目標で算出した参考値です。営業状況・サービス品質・育成時間と合わせて確認してください。
            </p>
          </div>
          <p className="monthly-target-coverage">
            {p.current.days === 0
              ? "対象月は未到来です。実績はまだありません。"
              : `入力済み日報 ${p.current.reports.length}/${p.current.expected} 件。${p.current.missing.length ? `未入力 ${p.current.missing.length} 件を含むため参考値です。` : "対象期間の入力が揃っています。"}`}{" "}
            月末の着地予測は行っていません。
          </p>
          {ids.length > 1 && (
            <p className="monthly-target-coverage">
              全社の人時売上高目標は、店舗の売上目標合計 ÷
              労働時間の目安合計で算出します。
            </p>
          )}
        </>
      ) : (
        <div className="monthly-target-empty">
          <Target size={30} />
          <div>
            <h3>まずは、2つの目標から。</h3>
            <p>
              店舗ごとに「月間売上」と「人時売上高」を設定します。目標額は自動で決めません。
            </p>
            {ids.length > 1 && (
              <p>全店舗の目標が揃うと、全社の進捗を表示します。</p>
            )}
          </div>
        </div>
      )}
      {ids.length > 1 && (
        <div className="monthly-target-stores">
          {ids.map((id) => {
            const t = state.targets.find(
              (t) => t.storeId === id && t.month === month,
            );
            return (
              <div key={id}>
                <div>
                  <strong>{name(id)}</strong>
                  <p>
                    {t
                      ? `売上 ${yen(t.salesTarget)} / 人時 ${yen(t.productivityTarget)}`
                      : "月次目標は未設定"}
                  </p>
                </div>
                <button className="text-button" onClick={() => edit(id)}>
                  {name(id)}の目標を{t ? "編集" : "設定"}
                  <Pencil size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TargetMetric({
  label,
  actual,
  goal,
  rate,
  unit,
  children,
}: {
  label: string;
  actual: string;
  goal: string;
  rate: number | null;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <article className="monthly-target-metric" aria-label={label}>
      <h3>{label}</h3>
      <strong>{actual}</strong>
      <p className="monthly-target-value">目標 {goal}</p>
      <div className="monthly-target-rate">
        <span>{unit}</span>
        <strong>{rate == null ? "未算出" : percent(rate)}</strong>
      </div>
      {rate != null && (
        <div
          className="monthly-target-track"
          role="progressbar"
          aria-label={`${label}の進捗`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, rate))}
          aria-valuetext={percent(rate)}
        >
          <span style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
        </div>
      )}
      <p className="monthly-target-description">{children}</p>
    </article>
  );
}

export function MonthlyTargetEditor({
  target,
  previous,
  storeId,
  month,
  session,
  close,
  saved,
}: {
  target?: MonthlyTarget;
  previous?: MonthlyTarget;
  storeId: StoreId;
  month: string;
  session: Session;
  close: () => void;
  saved: () => void;
}) {
  const [snapshot] = useState(target);
  const [values, setValues] = useState({
    sales: target ? String(target.salesTarget) : "",
    productivity: target ? String(target.productivityTarget) : "",
  });
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!/^\d+$/.test(values.sales) || !/^\d+$/.test(values.productivity))
        throw new Error("目標は1以上の整数で入力してください");
      updateFinance((s) =>
        saveMonthlyTarget(
          s,
          session,
          {
            storeId,
            month,
            salesTarget: Number(values.sales),
            productivityTarget: Number(values.productivity),
          },
          snapshot
            ? { id: snapshot.id, revision: snapshot.revision }
            : undefined,
        ),
      );
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "目標を保存できませんでした");
    }
  }
  return (
    <Dialog
      title="月次目標を設定"
      subtitle={`${name(storeId)} / ${month}`}
      close={close}
    >
      <form className="editor-form" onSubmit={submit}>
        <p className="finance-form-hint">
          サンプルで操作をお試しください。実際の経営数値は入力しないでください。
        </p>
        {!snapshot && (
          <button
            type="button"
            className="button secondary"
            disabled={!previous}
            onClick={() =>
              previous &&
              setValues({
                sales: String(previous.salesTarget),
                productivity: String(previous.productivityTarget),
              })
            }
          >
            <Copy size={16} />
            前月の目標をコピー
          </button>
        )}
        {!snapshot && !previous && (
          <p className="small muted">
            {monthShift(month, -1)} の目標は未設定です。
          </p>
        )}
        <label>
          月間売上目標（税込・円）
          <input
            aria-label="月間売上目標"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={100000000}
            step={1}
            value={values.sales}
            onChange={(e) => setValues({ ...values, sales: e.target.value })}
          />
        </label>
        <label>
          人時売上高目標（円／人時）
          <input
            aria-label="人時売上高目標"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={1000000}
            step={1}
            value={values.productivity}
            onChange={(e) =>
              setValues({ ...values, productivity: e.target.value })
            }
          />
        </label>
        <p className="finance-form-hint">
          人時売上高 ＝ 税込総売上 ÷ スタッフ全員の総労働時間（休憩を除く）。
        </p>
        {Number(values.sales) > 0 && Number(values.productivity) > 0 && (
          <div className="monthly-target-preview">
            月間総労働時間の目安
            <strong>
              {hours(
                Math.floor(
                  (Number(values.sales) * 60) / Number(values.productivity),
                ),
              )}
            </strong>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            キャンセル
          </button>
          <button type="submit" className="button primary">
            <Check size={16} />
            月次目標を保存
          </button>
        </div>
      </form>
    </Dialog>
  );
}
