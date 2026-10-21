"use client";
import { useState, type FormEvent } from "react";
import { Check, Info } from "lucide-react";
import { stores, today, type Session, type StoreId } from "@/lib/domain";
import {
  cashCategories,
  hours,
  saveCash,
  saveDaily,
  saveOpening,
  voidCash,
  yen,
  type CashInput,
  type CashMovement,
  type DailyReport,
  type Opening,
} from "@/lib/finance";
import { updateFinance } from "@/lib/finance-store";
import { Dialog } from "./dialog";

const demoNotice = (
  <div className="info-note">
    <Info size={17} />
    <span>
      サンプル専用です。実際の売上・取引先・個人情報は入力しないでください。
    </span>
  </div>
);
function integer(value: string, label: string) {
  if (!/^\d+$/.test(value))
    throw new Error(`${label}は0以上の整数で入力してください`);
  return Number(value);
}
function Footer({
  close,
  label = "保存する",
}: {
  close: () => void;
  label?: string;
}) {
  return (
    <div className="dialog-footer">
      <button type="button" className="button secondary" onClick={close}>
        キャンセル
      </button>
      <button type="submit" className="button primary">
        <Check size={17} />
        {label}
      </button>
    </div>
  );
}

export function DailyEditor({
  report,
  storeId,
  date,
  changeDate,
  session,
  close,
  saved,
}: {
  report?: DailyReport;
  storeId: StoreId;
  date: string;
  changeDate: (d: string) => void;
  session: Session;
  close: () => void;
  saved: () => void;
}) {
  const [snapshot] = useState(report);
  const [form, setForm] = useState({
    businessStatus: report?.businessStatus ?? "営業",
    cashSales: report ? String(report.cashSales) : "",
    cashlessSales: report ? String(report.cashlessSales) : "",
    laborHours: report ? String(Math.floor(report.laborMinutes / 60)) : "",
    laborRemainder: report ? String(report.laborMinutes % 60) : "0",
    memo: report?.memo ?? "",
    countedCash: report?.countedCash == null ? "" : String(report.countedCash),
  });
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const minutes = integer(form.laborRemainder, "労働時間の分");
      if (minutes > 59) throw new Error("分は0〜59で入力してください");
      const input = {
        storeId,
        date,
        businessStatus: form.businessStatus,
        cashSales: integer(form.cashSales, "現金売上"),
        cashlessSales: integer(form.cashlessSales, "キャッシュレス売上"),
        laborMinutes: integer(form.laborHours, "労働時間の時間") * 60 + minutes,
        memo: form.memo,
        countedCash:
          form.countedCash === ""
            ? null
            : integer(form.countedCash, "実際の現金残高"),
      };
      updateFinance((s) =>
        saveDaily(
          s,
          session,
          input,
          snapshot
            ? { id: snapshot.id, revision: snapshot.revision }
            : undefined,
        ),
      );
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  const total =
    (Number(form.cashSales) || 0) + (Number(form.cashlessSales) || 0);
  return (
    <Dialog
      title={snapshot ? "1日の日報を編集" : "1日の日報をつける"}
      subtitle={stores.find((s) => s.id === storeId)?.name}
      close={close}
      wide
    >
      <form className="editor-form" onSubmit={submit}>
        {demoNotice}
        <div className="form-row">
          <label>
            営業日
            <input
              aria-label="日報の営業日"
              type="date"
              required
              max={today()}
              value={date}
              onChange={(e) => {
                if (e.target.value) changeDate(e.target.value);
              }}
            />
          </label>
          <label>
            営業状況
            <select
              aria-label="営業状況"
              value={form.businessStatus}
              onChange={(e) =>
                setForm({
                  ...form,
                  businessStatus: e.target.value as "営業" | "休業",
                  ...(e.target.value === "休業"
                    ? { cashSales: "0", cashlessSales: "0" }
                    : {}),
                })
              }
            >
              <option>営業</option>
              <option>休業</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            現金売上（税込・円）
            <input
              required
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              step={1}
              value={form.cashSales}
              onChange={(e) => setForm({ ...form, cashSales: e.target.value })}
            />
          </label>
          <label>
            キャッシュレス売上（税込・円）
            <input
              required
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              step={1}
              value={form.cashlessSales}
              onChange={(e) =>
                setForm({ ...form, cashlessSales: e.target.value })
              }
            />
          </label>
        </div>
        <div className="daily-total">
          <span>この日の総売上</span>
          <strong>{yen(total)}</strong>
        </div>
        <fieldset className="labor-input">
          <legend>総労働時間（全員の合計・休憩を除く）</legend>
          <div>
            <label>
              <span className="sr-only">総労働時間の時間</span>
              <input
                aria-label="総労働時間の時間"
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={1}
                value={form.laborHours}
                onChange={(e) =>
                  setForm({ ...form, laborHours: e.target.value })
                }
              />
              時間
            </label>
            <label>
              <span className="sr-only">総労働時間の分</span>
              <input
                aria-label="総労働時間の分"
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={1}
                value={form.laborRemainder}
                onChange={(e) =>
                  setForm({ ...form, laborRemainder: e.target.value })
                }
              />
              分
            </label>
          </div>
          <p>
            例：4人がそれぞれ6時間勤務した日は「24時間」。24時間を超える合計も記録できます。
          </p>
        </fieldset>
        <label>
          1日のメモ・振り返り
          <textarea
            rows={3}
            maxLength={1200}
            placeholder="できたこと、気づいたこと、明日につなげたいこと。架空の内容でお試しください。"
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </label>
        <details className="reflection-fields">
          <summary>閉店時の現金を確認する（任意）</summary>
          <div className="reflection-content">
            <label>
              実際に数えた店舗現金の残高（円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100000000}
                step={1}
                placeholder="空欄なら未確認"
                value={form.countedCash}
                onChange={(e) =>
                  setForm({ ...form, countedCash: e.target.value })
                }
              />
            </label>
            <p className="small muted">
              レジ・金庫など、出納帳で管理する現金の合計です。出納帳で計算残高との差を確認できます。
            </p>
          </div>
        </details>
        <p className="finance-form-hint">
          現金売上は出納帳へ自動反映。カード・QR決済などは総売上に含め、店舗現金の残高には含めません。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Footer close={close} label="日報を保存" />
      </form>
    </Dialog>
  );
}
export function CashEditor({
  movement,
  storeId,
  date,
  session,
  close,
  saved,
}: {
  movement?: CashMovement;
  storeId: StoreId;
  date: string;
  session: Session;
  close: () => void;
  saved: () => void;
}) {
  const [snapshot] = useState(movement);
  const [form, setForm] = useState({
    date: movement?.date ?? date,
    direction: movement?.direction ?? "出金",
    category: movement?.category ?? "仕入",
    amount: movement ? String(movement.amount) : "",
    description: movement?.description ?? "",
  });
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const input: CashInput = {
        ...form,
        storeId,
        amount: integer(form.amount, "金額"),
      };
      updateFinance((s) =>
        saveCash(
          s,
          session,
          input,
          snapshot
            ? { id: snapshot.id, revision: snapshot.revision }
            : undefined,
        ),
      );
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <Dialog
      title={snapshot ? "現金明細を編集" : "現金の入出金を記録"}
      subtitle={stores.find((s) => s.id === storeId)?.name}
      close={close}
    >
      <form className="editor-form" onSubmit={submit}>
        {demoNotice}
        <p className="finance-form-hint">
          現金売上は日報から自動反映されます。ここには売上以外の現金移動を入力してください。
        </p>
        <label>
          日付
          <input
            aria-label="現金明細の日付"
            required
            type="date"
            max={today()}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            入出金
            <select
              aria-label="入出金"
              value={form.direction}
              onChange={(e) => {
                const direction = e.target.value as "入金" | "出金";
                setForm({
                  ...form,
                  direction,
                  category: cashCategories[direction][0],
                });
              }}
            >
              <option>入金</option>
              <option>出金</option>
            </select>
          </label>
          <label>
            区分
            <select
              aria-label="現金明細の区分"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {cashCategories[form.direction].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          金額（円）
          <input
            aria-label="現金明細の金額"
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={100000000}
            step={1}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>
        <label>
          摘要
          <input
            required
            maxLength={200}
            placeholder="例：サンプル食材の仕入"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <p className="small muted">
          「銀行入金」は店舗現金からの出金です。キャッシュレス売上の銀行振込は、この現金出納帳には記録しません。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Footer close={close} label="現金明細を保存" />
      </form>
    </Dialog>
  );
}
export function OpeningEditor({
  opening,
  storeId,
  session,
  close,
  saved,
}: {
  opening?: Opening;
  storeId: StoreId;
  session: Session;
  close: () => void;
  saved: () => void;
}) {
  const [date, setDate] = useState(opening?.date ?? today()),
    [amount, setAmount] = useState(opening ? String(opening.amount) : ""),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      updateFinance((s) =>
        saveOpening(s, session, {
          storeId,
          date,
          amount: integer(amount, "開始残高"),
        }),
      );
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <Dialog
      title="出納帳の開始残高"
      subtitle={stores.find((s) => s.id === storeId)?.name}
      close={close}
    >
      <form className="editor-form" onSubmit={submit}>
        {demoNotice}
        <p className="small muted">
          開始日の営業前に保有している現金です。月初の繰越残高は、この開始残高と過去の入出金から自動計算します。
        </p>
        <label>
          出納帳開始日
          <input
            required
            type="date"
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          営業前の現金残高（円）
          <input
            required
            type="number"
            min={0}
            max={100000000}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <p className="info-note">
          開始残高を変えると、それ以降の計算残高がすべて変わります。変更は履歴に残ります。
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Footer close={close} label="開始残高を保存" />
      </form>
    </Dialog>
  );
}
export function VoidCashDialog({
  movement,
  session,
  close,
  saved,
}: {
  movement: CashMovement;
  session: Session;
  close: () => void;
  saved: () => void;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      updateFinance((s) =>
        voidCash(s, session, movement.id, movement.revision, reason),
      );
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消できませんでした");
    }
  }
  return (
    <Dialog title="現金明細を取り消す" close={close}>
      <form className="editor-form" onSubmit={submit}>
        <p>
          {movement.date} / {movement.description} / {yen(movement.amount)}
        </p>
        <p className="small muted">
          取り消した明細は残高計算から除外し、元の内容と理由は履歴に残します。
        </p>
        <label>
          取消理由
          <textarea
            required
            maxLength={300}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Footer close={close} label="理由を記録して取消" />
      </form>
    </Dialog>
  );
}
export function ReportValues({ report }: { report: DailyReport }) {
  return (
    <dl className="report-values">
      <div>
        <dt>営業日・営業状況</dt>
        <dd>
          {report.date} / {report.businessStatus}
        </dd>
      </div>
      <div>
        <dt>現金売上</dt>
        <dd>{yen(report.cashSales)}</dd>
      </div>
      <div>
        <dt>キャッシュレス売上</dt>
        <dd>{yen(report.cashlessSales)}</dd>
      </div>
      <div>
        <dt>総労働時間</dt>
        <dd>{hours(report.laborMinutes)}</dd>
      </div>
      <div>
        <dt>振り返り</dt>
        <dd>{report.memo || "記入なし"}</dd>
      </div>
      <div>
        <dt>実際に数えた店舗現金の残高</dt>
        <dd>
          {report.countedCash == null ? "未確認" : yen(report.countedCash)}
        </dd>
      </div>
    </dl>
  );
}
