"use client";
import { Plus, Trash2 } from "lucide-react";
import {
  cashCategories,
  type CashEdit,
  type CashMovement,
} from "@/lib/finance";
import type { StoreId } from "@/lib/domain";

type Values = {
  direction: "入金" | "出金";
  category: string;
  amount: string;
  description: string;
  customCategory: string;
  receiptAmount: string;
  receiptDescription: string;
};
export type CashDraft = {
  key: string;
  values: Values;
  original?: Values;
  source?: { id: string; revision: number };
};
export function cashDrafts(movements: CashMovement[]): CashDraft[] {
  return movements
    .filter((m) => !m.voided)
    .map((m) => {
      const values: Values = {
        direction: m.direction,
        category: m.category,
        amount: String(m.amount),
        description: m.description,
        customCategory: m.customCategory ?? "",
        receiptAmount: m.receiptAmount == null ? "" : String(m.receiptAmount),
        receiptDescription: m.receiptDescription ?? "",
      };
      return {
        key: m.id,
        values,
        original: values,
        source: { id: m.id, revision: m.revision },
      };
    });
}
function integer(value: string, field: string) {
  if (!/^\d+$/.test(value))
    throw new Error(`${field}は0以上の整数で入力してください`);
  return Number(value);
}
export function cashEdits(
  drafts: CashDraft[],
  storeId: StoreId,
  date: string,
): CashEdit[] {
  return drafts
    .filter(
      (d) =>
        !d.original || JSON.stringify(d.values) !== JSON.stringify(d.original),
    )
    .map((d) => ({
      edit: d.source,
      input: {
        storeId,
        date,
        direction: d.values.direction,
        category: d.values.category,
        amount: integer(d.values.amount, "現金明細の金額"),
        description: d.values.description,
        customCategory:
          d.values.category === "自由項目"
            ? d.values.customCategory
            : undefined,
        receiptAmount:
          d.values.receiptAmount === ""
            ? null
            : integer(d.values.receiptAmount, "レシート金額"),
        receiptDescription: d.values.receiptDescription,
      },
    }));
}

export function DailyCashFields({
  rows,
  change,
}: {
  rows: CashDraft[];
  change: (rows: CashDraft[]) => void;
}) {
  const patch = (key: string, values: Partial<Values>) =>
    change(
      rows.map((row) =>
        row.key === key
          ? { ...row, values: { ...row.values, ...values } }
          : row,
      ),
    );
  return (
    <details className="reflection-fields daily-cash-fields">
      <summary>現金入出金をまとめて記録（任意・{rows.length}件）</summary>
      <div className="reflection-content">
        <p className="finance-form-hint">
          仕入れ・支払い・銀行入金など、その日に現金が動いた明細を追加できます。現金売上は自動反映されるため、ここへの入力は不要です。
        </p>
        {rows.map((row, index) => {
          const v = row.values,
            prefix = `日報の現金明細${index + 1}`;
          return (
            <fieldset className="daily-cash-row" key={row.key}>
              <legend>
                現金明細 {index + 1}
                {row.source ? "（登録済み）" : "（新規）"}
              </legend>
              <div className="form-row">
                <label>
                  入出金
                  <select
                    aria-label={`${prefix}の入出金`}
                    value={v.direction}
                    onChange={(e) => {
                      const direction = e.target.value as Values["direction"];
                      patch(row.key, {
                        direction,
                        category: cashCategories[direction][0],
                        customCategory: "",
                      });
                    }}
                  >
                    <option>出金</option>
                    <option>入金</option>
                  </select>
                </label>
                <label>
                  区分
                  <select
                    aria-label={`${prefix}の区分`}
                    value={v.category}
                    onChange={(e) =>
                      patch(row.key, { category: e.target.value })
                    }
                  >
                    {cashCategories[v.direction]
                      .filter(
                        (c) =>
                          c !== "仕入" || row.original?.category === "仕入",
                      )
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                </label>
              </div>
              {v.category === "自由項目" && (
                <label>
                  自由項目の名称
                  <input
                    aria-label={`${prefix}の自由項目名`}
                    required
                    maxLength={80}
                    value={v.customCategory}
                    onChange={(e) =>
                      patch(row.key, { customCategory: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="form-row">
                <label>
                  金額（円）
                  <input
                    aria-label={`${prefix}の金額`}
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000000}
                    step={1}
                    value={v.amount}
                    onChange={(e) => patch(row.key, { amount: e.target.value })}
                  />
                </label>
                <label>
                  摘要
                  <input
                    aria-label={`${prefix}の摘要`}
                    required
                    maxLength={200}
                    placeholder="架空の内容でお試しください"
                    value={v.description}
                    onChange={(e) =>
                      patch(row.key, { description: e.target.value })
                    }
                  />
                </label>
              </div>
              <details className="daily-receipt-fields">
                <summary>レシートの金額・摘要（任意）</summary>
                <div className="form-row">
                  <label>
                    レシート金額（円）
                    <input
                      aria-label={`${prefix}のレシート金額`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100000000}
                      step={1}
                      value={v.receiptAmount}
                      onChange={(e) =>
                        patch(row.key, { receiptAmount: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    レシートの摘要
                    <textarea
                      aria-label={`${prefix}のレシート摘要`}
                      rows={2}
                      maxLength={400}
                      value={v.receiptDescription}
                      onChange={(e) =>
                        patch(row.key, { receiptDescription: e.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="finance-form-hint">
                  参考情報として保存します。レシート金額を追加の出金にしません。
                </p>
              </details>
              {row.source ? (
                <p className="small muted">
                  明細を取り消す場合は、現金出納帳から理由を記録してください。
                </p>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  aria-label={`${prefix}を削除`}
                  onClick={() => change(rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 size={15} />
                  入力行を削除
                </button>
              )}
            </fieldset>
          );
        })}
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            change([
              ...rows,
              {
                key: crypto.randomUUID(),
                values: {
                  direction: "出金",
                  category: "仕入れ",
                  amount: "",
                  description: "",
                  customCategory: "",
                  receiptAmount: "",
                  receiptDescription: "",
                },
              },
            ])
          }
        >
          <Plus size={16} />
          現金明細を追加
        </button>
        <p className="finance-form-hint">
          カード・PayPay等の売上は、日報のキャッシュレス売上に入力します。
        </p>
      </div>
    </details>
  );
}
