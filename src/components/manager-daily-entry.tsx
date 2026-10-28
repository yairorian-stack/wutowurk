"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, NotebookPen, Plus, Trash2 } from "lucide-react";
import { stores, today, type StoreId } from "@/lib/domain";
import { hours, yen } from "@/lib/finance";
import type {
  ManagerCashExpense,
  ManagerDailyReport,
} from "@/lib/manager-daily";
import type { SharedSalesState } from "@/lib/shared-sales";
import { Dialog } from "./dialog";

type ExpenseDraft = {
  key: string;
  category: string;
  description: string;
  amount: string;
};
type FormState = {
  reportDate: string;
  cashSales: string;
  creditSales: string;
  qrSales: string;
  giftCertificate: string;
  otherCashless: string;
  laborHours: string;
  laborMinutes: string;
  voucherCount: string;
  voucherDiscount: string;
  memo: string;
  expenses: ExpenseDraft[];
};

const storeName = (storeId: StoreId) =>
  stores.find((store) => store.id === storeId)!.short;
const number = (value: string) => (/^\d+$/.test(value) ? Number(value) : NaN);
const blankForm = (date: string): FormState => ({
  reportDate: date,
  cashSales: "",
  creditSales: "0",
  qrSales: "0",
  giftCertificate: "0",
  otherCashless: "0",
  laborHours: "",
  laborMinutes: "0",
  voucherCount: "0",
  voucherDiscount: "0",
  memo: "",
  expenses: [],
});

function existingForm(
  report: ManagerDailyReport,
  expenses: ManagerCashExpense[],
): FormState {
  return {
    reportDate: report.report_date,
    cashSales: String(report.cash_sales_jpy),
    creditSales: String(report.credit_sales_jpy),
    qrSales: String(report.qr_sales_jpy),
    giftCertificate: String(report.gift_certificate_jpy),
    otherCashless: String(report.other_cashless_jpy),
    laborHours: String(Math.floor(report.labor_minutes / 60)),
    laborMinutes: String(report.labor_minutes % 60),
    voucherCount: String(report.voucher_count),
    voucherDiscount: String(report.voucher_discount_jpy),
    memo: report.memo,
    expenses: expenses
      .filter(
        (expense) =>
          expense.store_id === report.store_id &&
          expense.report_date === report.report_date,
      )
      .map((expense) => ({
        key: `${report.store_id}-${report.report_date}-${expense.sort_order}`,
        category: expense.category,
        description: expense.description,
        amount: String(expense.amount_jpy),
      })),
  };
}

export function ManagerDailyEntry({
  shared,
  scope,
}: {
  shared: SharedSalesState;
  scope: StoreId | "all";
}) {
  const reports = shared.managerReports ?? [];
  const expenses = shared.managerExpenses ?? [];
  const [selectedStore, setSelectedStore] = useState<StoreId | null>(null);
  const [form, setForm] = useState<FormState>(() => blankForm(today()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(
    () =>
      [
        form.cashSales,
        form.creditSales,
        form.qrSales,
        form.giftCertificate,
        form.otherCashless,
      ].reduce((sum, value) => sum + (number(value) || 0), 0),
    [form],
  );
  function formFor(storeId: StoreId, date: string) {
    const report = reports.find(
      (row) => row.store_id === storeId && row.report_date === date,
    );
    return report ? existingForm(report, expenses) : blankForm(date);
  }
  function open(storeId: StoreId) {
    setSelectedStore(storeId);
    setForm(formFor(storeId, today()));
    setError("");
  }
  function changeDate(date: string) {
    if (!selectedStore) return;
    setForm(formFor(selectedStore, date));
    setError("");
  }
  function patchExpense(key: string, patch: Partial<ExpenseDraft>) {
    setForm((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.key === key ? { ...expense, ...patch } : expense,
      ),
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedStore || busy) return;
    setBusy(true);
    setError("");
    try {
      const minutes = number(form.laborMinutes);
      if (minutes < 0 || minutes > 59)
        throw new Error("労働時間の分は0〜59で入力してください。");
      const payload = {
        storeId: selectedStore,
        reportDate: form.reportDate,
        cashSalesJpy: number(form.cashSales),
        creditSalesJpy: number(form.creditSales),
        qrSalesJpy: number(form.qrSales),
        giftCertificateJpy: number(form.giftCertificate),
        otherCashlessJpy: number(form.otherCashless),
        laborMinutes: number(form.laborHours) * 60 + minutes,
        voucherCount: number(form.voucherCount),
        voucherDiscountJpy: number(form.voucherDiscount),
        memo: form.memo,
        expenses: form.expenses.map((expense) => ({
          category: expense.category,
          description: expense.description,
          amountJpy: number(expense.amount),
        })),
      };
      const response = await fetch("/api/finance/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? "店長日報を保存できませんでした。");
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "店長日報を保存できませんでした。",
      );
      setBusy(false);
    }
  }
  if (shared.managerDailyStatus === "setup-required")
    return (
      <section className="panel manager-entry-status">
        <NotebookPen size={24} />
        <div>
          <h2>店長日報の入力機能を準備しています</h2>
          <p>保存先の初期設定が完了すると、この画面から入力できます。</p>
        </div>
      </section>
    );
  if (shared.managerDailyStatus === "unavailable")
    return (
      <section className="panel manager-entry-status" role="alert">
        <NotebookPen size={24} />
        <div>
          <h2>店長日報の保存先へ接続できません</h2>
          <p>実績の閲覧は続けられます。接続を確認してから再度お試しください。</p>
        </div>
      </section>
    );
  const choices: StoreId[] = scope === "all" ? ["honten", "816"] : [scope];
  return (
    <>
      <section className="panel manager-entry-launcher">
        <div>
          <p className="eyebrow">MANAGER DAILY REPORT</p>
          <h2>本日の店長日報</h2>
          <p>
            売上・総労働時間・決済内訳・レシート支払いをまとめて登録し、実績資料へ反映します。
          </p>
        </div>
        <div className="manager-entry-actions">
          {choices.map((storeId) => (
            <button
              key={storeId}
              className="button primary"
              onClick={() => open(storeId)}
            >
              <NotebookPen size={18} />
              {storeName(storeId)} 本日の店長日報を開始
            </button>
          ))}
        </div>
      </section>
      {selectedStore && (
        <Dialog
          title={`${storeName(selectedStore)} 店長日報`}
          subtitle="保存後、売上集計・日報一覧・現金出納帳へ反映します。"
          close={() => setSelectedStore(null)}
          wide
        >
          <form className="editor-form manager-daily-form" onSubmit={submit}>
            <label>
              営業日
              <input
                type="date"
                required
                min="2026-08-01"
                max={today()}
                value={form.reportDate}
                onChange={(event) => changeDate(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>売上・決済内訳</legend>
              <p className="finance-form-hint">
                売上高は、下の決済内訳を合計して自動計算します。
              </p>
              <div className="manager-sales-total">
                <span>本日の売上高</span>
                <strong>{yen(total)}</strong>
              </div>
              <div className="manager-tender-grid">
                {(
                  [
                    ["cashSales", "現金売上"],
                    ["creditSales", "クレジット"],
                    ["qrSales", "QR・電子マネー"],
                    ["giftCertificate", "商品券"],
                    ["otherCashless", "その他キャッシュレス"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}（円）
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100000000}
                      step={1}
                      value={form[key]}
                      onChange={(event) =>
                        setForm({ ...form, [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="labor-input">
              <legend>本日の店舗総労働時間（全員合計・休憩を除く）</legend>
              <div>
                <label>
                  <input
                    aria-label="本日の店舗総労働時間の時間"
                    required
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10000}
                    step={1}
                    value={form.laborHours}
                    onChange={(event) =>
                      setForm({ ...form, laborHours: event.target.value })
                    }
                  />
                  時間
                </label>
                <label>
                  <input
                    aria-label="本日の店舗総労働時間の分"
                    required
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={1}
                    value={form.laborMinutes}
                    onChange={(event) =>
                      setForm({ ...form, laborMinutes: event.target.value })
                    }
                  />
                  分
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>割引券</legend>
              <div className="form-row">
                <label>
                  使用枚数（枚）
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100000}
                    step={1}
                    value={form.voucherCount}
                    onChange={(event) =>
                      setForm({ ...form, voucherCount: event.target.value })
                    }
                  />
                </label>
                <label>
                  割引額（円）
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100000000}
                    step={1}
                    value={form.voucherDiscount}
                    onChange={(event) =>
                      setForm({ ...form, voucherDiscount: event.target.value })
                    }
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>レシート支払い・現金出金</legend>
              <p className="finance-form-hint">
                仕入れ・消耗品など、店舗現金から支払った明細を追加してください。
              </p>
              {form.expenses.map((expense, index) => (
                <div className="manager-expense-row" key={expense.key}>
                  <label>
                    区分
                    <input
                      required
                      maxLength={80}
                      placeholder="例：仕入れ"
                      value={expense.category}
                      onChange={(event) =>
                        patchExpense(expense.key, {
                          category: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    摘要
                    <input
                      required
                      maxLength={200}
                      placeholder="例：食材レシート"
                      value={expense.description}
                      onChange={(event) =>
                        patchExpense(expense.key, {
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    金額（円）
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100000000}
                      step={1}
                      value={expense.amount}
                      onChange={(event) =>
                        patchExpense(expense.key, { amount: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`レシート支払い${index + 1}を削除`}
                    onClick={() =>
                      setForm({
                        ...form,
                        expenses: form.expenses.filter(
                          (row) => row.key !== expense.key,
                        ),
                      })
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setForm({
                    ...form,
                    expenses: [
                      ...form.expenses,
                      {
                        key: crypto.randomUUID(),
                        category: "レシート支払い",
                        description: "",
                        amount: "",
                      },
                    ],
                  })
                }
              >
                <Plus size={17} />
                レシート支払いを追加
              </button>
            </fieldset>
            <label>
              本日の申し送り・メモ（任意）
              <textarea
                rows={3}
                maxLength={1200}
                value={form.memo}
                onChange={(event) =>
                  setForm({ ...form, memo: event.target.value })
                }
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedStore(null)}
              >
                キャンセル
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                <Check size={18} />
                {busy ? "反映中…" : "日報を保存して資料へ反映"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function ManagerDailyReportList({
  shared,
  scope,
}: {
  shared: SharedSalesState;
  scope: StoreId | "all";
}) {
  const reports = (shared.managerReports ?? [])
    .filter((report) => scope === "all" || report.store_id === scope)
    .sort((a, b) => b.report_date.localeCompare(a.report_date))
    .slice(0, 31);
  if (!reports.length) return null;
  return (
    <section className="panel manager-report-list">
      <p className="eyebrow">MANAGER REPORTS</p>
      <h2>店長日報の反映状況</h2>
      <div className="local-table-scroll">
        <table className="local-table">
          <thead>
            <tr>
              <th scope="col">日付・店舗</th>
              <th scope="col">売上高</th>
              <th scope="col">総労働時間</th>
              <th scope="col">決済内訳</th>
              <th scope="col">割引券</th>
              <th scope="col">レシート支払い</th>
              <th scope="col">メモ</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const reportExpenses = (shared.managerExpenses ?? []).filter(
                (expense) =>
                  expense.store_id === report.store_id &&
                  expense.report_date === report.report_date,
              );
              return (
                <tr key={`${report.store_id}/${report.report_date}`}>
                  <th scope="row">
                    {report.report_date}
                    <small>{storeName(report.store_id)}</small>
                  </th>
                  <td>{yen(report.sales_jpy)}</td>
                  <td>{hours(report.labor_minutes)}</td>
                  <td className="manager-tender-summary">
                    現金 {yen(report.cash_sales_jpy)}
                    <br />
                    クレジット {yen(report.credit_sales_jpy)}
                    <br />
                    QR等 {yen(report.qr_sales_jpy)}
                    <br />
                    商品券 {yen(report.gift_certificate_jpy)}
                    <br />
                    その他 {yen(report.other_cashless_jpy)}
                  </td>
                  <td>
                    {report.voucher_count}枚・{yen(report.voucher_discount_jpy)}
                  </td>
                  <td>
                    {reportExpenses.length
                      ? `${reportExpenses.length}件・${yen(
                          reportExpenses.reduce(
                            (sum, expense) => sum + expense.amount_jpy,
                            0,
                          ),
                        )}`
                      : "なし"}
                  </td>
                  <td>{report.memo || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
