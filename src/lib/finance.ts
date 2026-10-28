import { z } from "zod";
import {
  canEdit,
  dateSchema,
  roles,
  stores,
  today,
  type Session,
  type StoreId,
} from "./domain";

const money = z.number().int().min(0).max(100_000_000);
const store = z.enum(["honten", "816"]);
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (m) => Number(m.slice(0, 4)) >= 1900 && Number(m.slice(0, 4)) <= 2200,
  );
export const monthlyTargetInputSchema = z.object({
  storeId: store,
  month: monthSchema,
  salesTarget: money.refine(
    (n) => n > 0,
    "売上目標は1円以上で入力してください",
  ),
  productivityTarget: z.number().int().min(1).max(1_000_000),
});
export const monthlyTargetSchema = monthlyTargetInputSchema.extend({
  id: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
});
export type MonthlyTargetInput = z.infer<typeof monthlyTargetInputSchema>;
export type MonthlyTarget = z.infer<typeof monthlyTargetSchema>;
export const dailyInputSchema = z
  .object({
    storeId: store,
    date: dateSchema,
    businessStatus: z.enum(["営業", "休業"]),
    cashSales: money,
    cashlessSales: money,
    laborMinutes: z.number().int().min(0).max(600_000),
    memo: z.string().trim().max(1200),
    countedCash: money.nullable(),
    voucherCount: z.number().int().min(0).max(100_000).optional(),
    voucherDiscount: money.optional(),
  })
  .refine(
    (d) => d.businessStatus !== "休業" || d.cashSales + d.cashlessSales === 0,
    "休業日の売上は0円にしてください",
  )
  .refine(
    (v) =>
      (v.voucherCount == null && v.voucherDiscount == null) ||
      (v.voucherCount != null && v.voucherDiscount != null),
    "割引券は使用枚数・割引額を両方入力してください",
  )
  .refine(
    (v) => !(v.voucherDiscount && !v.voucherCount),
    "割引額がある場合は使用枚数を1枚以上で入力してください",
  );
export const dailySchema = dailyInputSchema.and(
  z.object({
    id: z.string(),
    revision: z.number().int().positive(),
    updatedAt: z.string(),
  }),
);
export type DailyInput = z.infer<typeof dailyInputSchema>;
export type DailyReport = z.infer<typeof dailySchema>;
export const cashCategories = {
  入金: ["釣銭補充", "寄付", "雑収入", "自由項目", "その他入金"],
  出金: [
    "仕入れ",
    "寄付",
    "支払い",
    "消耗品",
    "銀行入金",
    "自由項目",
    "その他支出",
    "仕入",
  ],
} as const;
export const cashInputSchema = z
  .object({
    storeId: store,
    date: dateSchema,
    direction: z.enum(["入金", "出金"]),
    category: z.string(),
    amount: money.refine((n) => n > 0, "金額は1円以上で入力してください"),
    description: z.string().trim().min(1, "摘要を入力してください").max(200),
    customCategory: z.string().trim().max(80).optional(),
    receiptAmount: money.nullable().optional(),
    receiptDescription: z.string().trim().max(400).optional(),
  })
  .refine(
    (v) =>
      (cashCategories[v.direction] as readonly string[]).includes(v.category),
    "入出金と区分の組み合わせを確認してください",
  )
  .refine(
    (v) => v.category !== "自由項目" || !!v.customCategory?.trim(),
    "自由項目の名称を入力してください",
  )
  .refine(
    (v) =>
      (v.receiptAmount == null && !v.receiptDescription?.trim()) ||
      (v.receiptAmount != null && !!v.receiptDescription?.trim()),
    "レシートを記録するときは金額・摘要を両方入力してください",
  );
export type CashInput = z.infer<typeof cashInputSchema>;
export const cashSchema = cashInputSchema.and(
  z.object({
    id: z.string(),
    revision: z.number().int().positive(),
    updatedAt: z.string(),
    voided: z.boolean(),
    voidReason: z.string().max(300),
  }),
);
export type CashMovement = z.infer<typeof cashSchema>;
export function cashCategoryLabel(value: {
  category: string;
  customCategory?: string;
}) {
  return value.category === "自由項目"
    ? `自由項目：${value.customCategory ?? ""}`
    : value.category === "仕入"
      ? "仕入れ"
      : value.category;
}
export const openingSchema = z.object({
  storeId: store,
  date: dateSchema,
  amount: money,
});
export type Opening = z.infer<typeof openingSchema>;
export const financeAuditSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  storeId: store,
  operation: z.string(),
  entityId: z.string(),
  before: z
    .union([dailySchema, cashSchema, openingSchema, monthlyTargetSchema])
    .nullable(),
  after: z.union([dailySchema, cashSchema, openingSchema, monthlyTargetSchema]),
});
export type FinanceAudit = z.infer<typeof financeAuditSchema>;
export const financeSchema = z
  .object({
    version: z.literal(1),
    reports: z.array(dailySchema),
    movements: z.array(cashSchema),
    openings: z.array(openingSchema),
    history: z.array(financeAuditSchema),
    targets: z.array(monthlyTargetSchema).default([]),
  })
  .superRefine((state, context) => {
    const days = new Set<string>(),
      ids = new Set<string>(),
      balances = new Set<string>();
    for (const report of state.reports) {
      const key = `${report.storeId}:${report.date}`;
      if (days.has(key) || ids.has(report.id))
        context.addIssue({
          code: "custom",
          message: "日報の店舗・日付またはIDが重複しています",
        });
      days.add(key);
      ids.add(report.id);
    }
    for (const movement of state.movements) {
      if (ids.has(movement.id))
        context.addIssue({
          code: "custom",
          message: "現金明細のIDが重複しています",
        });
      ids.add(movement.id);
    }
    for (const opening of state.openings) {
      if (balances.has(opening.storeId))
        context.addIssue({
          code: "custom",
          message: "店舗の開始残高が重複しています",
        });
      balances.add(opening.storeId);
    }
    const targetKeys = new Set<string>();
    for (const target of state.targets) {
      const key = `${target.storeId}:${target.month}`;
      if (targetKeys.has(key) || ids.has(target.id))
        context.addIssue({
          code: "custom",
          message: "月次目標の店舗・月またはIDが重複しています",
        });
      targetKeys.add(key);
      ids.add(target.id);
    }
  });
export type FinanceState = z.infer<typeof financeSchema>;

export function canUseFinance(session: Session, storeId = session.storeId) {
  return canEdit(session, storeId);
}
function assertEdit(session: Session, storeId: StoreId) {
  if (!canUseFinance(session, storeId))
    throw new Error("この店舗の日報・出納帳を操作する権限がありません");
}
function assertDate(date: string, now: string) {
  if (date > now) throw new Error("未来の日付では登録できません");
}
function requireOpening(state: FinanceState, storeId: StoreId, date: string) {
  const opening = state.openings.find((o) => o.storeId === storeId);
  if (!opening || date < opening.date)
    throw new Error("出納帳の開始日以降の日付を指定してください");
}
function event(
  session: Session,
  storeId: StoreId,
  operation: string,
  entityId: string,
  before: FinanceAudit["before"],
  after: FinanceAudit["after"],
): FinanceAudit {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: `${roles[session.role]}（デモ）`,
    storeId,
    operation,
    entityId,
    before,
    after,
  };
}
export function saveDaily(
  state: FinanceState,
  session: Session,
  input: DailyInput,
  edit?: { id: string; revision: number },
  now = today(),
): FinanceState {
  const parsed = dailyInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const data = parsed.data;
  assertEdit(session, data.storeId);
  assertDate(data.date, now);
  requireOpening(state, data.storeId, data.date);
  const old = edit ? state.reports.find((r) => r.id === edit.id) : undefined;
  if (edit && (!old || old.revision !== edit.revision))
    throw new Error("ほかの画面で変更されました。日報を開き直してください");
  if (old && (old.storeId !== data.storeId || old.date !== data.date))
    throw new Error("既存の日報の店舗・日付は変更できません");
  if (
    !edit &&
    state.reports.some(
      (r) => r.storeId === data.storeId && r.date === data.date,
    )
  )
    throw new Error("この日の日報は登録済みです。一覧から編集してください");
  const report: DailyReport = {
    ...data,
    id: old?.id ?? crypto.randomUUID(),
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...state,
    reports: old
      ? state.reports.map((r) => (r.id === old.id ? report : r))
      : [...state.reports, report],
    history: [
      event(
        session,
        data.storeId,
        old ? "日報を更新" : "日報を登録",
        report.id,
        old ?? null,
        report,
      ),
      ...state.history,
    ],
  };
}
export function saveCash(
  state: FinanceState,
  session: Session,
  input: CashInput,
  edit?: { id: string; revision: number },
  now = today(),
): FinanceState {
  const parsed = cashInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const data = parsed.data;
  assertEdit(session, data.storeId);
  assertDate(data.date, now);
  requireOpening(state, data.storeId, data.date);
  const old = edit ? state.movements.find((m) => m.id === edit.id) : undefined;
  if (edit && (!old || old.revision !== edit.revision))
    throw new Error("ほかの画面で変更されました。明細を開き直してください");
  if (old && (old.storeId !== data.storeId || old.voided))
    throw new Error("店舗の変更・取消済み明細の編集はできません");
  const item: CashMovement = {
    ...data,
    id: old?.id ?? crypto.randomUUID(),
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    voided: false,
    voidReason: "",
  };
  return {
    ...state,
    movements: old
      ? state.movements.map((m) => (m.id === old.id ? item : m))
      : [...state.movements, item],
    history: [
      event(
        session,
        data.storeId,
        old ? "現金明細を更新" : "現金明細を登録",
        item.id,
        old ?? null,
        item,
      ),
      ...state.history,
    ],
  };
}
export type CashEdit = {
  input: CashInput;
  edit?: { id: string; revision: number };
};

// Compute the complete update before localStorage is written by updateFinance.
export function saveDailyEntry(
  state: FinanceState,
  session: Session,
  input: DailyInput,
  cashEntries: CashEdit[],
  edit?: { id: string; revision: number },
  now = today(),
): FinanceState {
  let next = saveDaily(state, session, input, edit, now);
  const ids = new Set<string>();
  for (const [index, entry] of cashEntries.entries()) {
    try {
      if (
        entry.input.storeId !== input.storeId ||
        entry.input.date !== input.date
      )
        throw new Error("日報と同じ店舗・日付の明細を指定してください");
      if (entry.edit) {
        const old = state.movements.find((m) => m.id === entry.edit!.id);
        if (!old || old.date !== input.date || old.storeId !== input.storeId)
          throw new Error("この日の明細ではありません");
        if (ids.has(entry.edit.id)) throw new Error("同じ明細が重複しています");
        ids.add(entry.edit.id);
      }
      next = saveCash(next, session, entry.input, entry.edit, now);
    } catch (error) {
      throw new Error(
        `現金明細${index + 1}：${error instanceof Error ? error.message : "入力を確認してください"}`,
      );
    }
  }
  return next;
}

export function saveMonthlyTarget(
  state: FinanceState,
  session: Session,
  input: MonthlyTargetInput,
  edit?: { id: string; revision: number },
): FinanceState {
  const parsed = monthlyTargetInputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("対象月と、1以上の整数の目標を入力してください");
  const data = parsed.data;
  assertEdit(session, data.storeId);
  const old = edit ? state.targets.find((t) => t.id === edit.id) : undefined;
  if (edit && (!old || old.revision !== edit.revision))
    throw new Error("ほかの画面で目標が変更されました。開き直してください");
  if (old && (old.storeId !== data.storeId || old.month !== data.month))
    throw new Error("既存の目標の店舗・月は変更できません");
  if (
    !edit &&
    state.targets.some(
      (t) => t.storeId === data.storeId && t.month === data.month,
    )
  )
    throw new Error("この月の目標は設定済みです。開き直してください");
  const target: MonthlyTarget = {
    ...data,
    id: old?.id ?? crypto.randomUUID(),
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...state,
    targets: old
      ? state.targets.map((t) => (t.id === old.id ? target : t))
      : [...state.targets, target],
    history: [
      event(
        session,
        data.storeId,
        old ? "月次目標を更新" : "月次目標を設定",
        target.id,
        old ?? null,
        target,
      ),
      ...state.history,
    ],
  };
}

export function voidCash(
  state: FinanceState,
  session: Session,
  id: string,
  revision: number,
  reason: string,
): FinanceState {
  const old = state.movements.find((m) => m.id === id);
  if (!old) throw new Error("明細が見つかりません");
  assertEdit(session, old.storeId);
  if (old.revision !== revision || old.voided)
    throw new Error("明細が変更済みです。開き直してください");
  if (!reason.trim() || reason.length > 300)
    throw new Error("取消理由を1〜300文字で入力してください");
  const item = {
    ...old,
    voided: true,
    voidReason: reason.trim(),
    revision: old.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...state,
    movements: state.movements.map((m) => (m.id === id ? item : m)),
    history: [
      event(session, old.storeId, "現金明細を取消", id, old, item),
      ...state.history,
    ],
  };
}
export function saveOpening(
  state: FinanceState,
  session: Session,
  input: Opening,
  now = today(),
): FinanceState {
  const data = openingSchema.parse(input);
  assertEdit(session, data.storeId);
  assertDate(data.date, now);
  if (
    [...state.reports, ...state.movements].some(
      (r) => r.storeId === data.storeId && r.date < data.date,
    )
  )
    throw new Error("登録済みの記録より後を開始日にはできません");
  const old = state.openings.find((o) => o.storeId === data.storeId);
  return {
    ...state,
    openings: [
      ...state.openings.filter((o) => o.storeId !== data.storeId),
      data,
    ],
    history: [
      event(
        session,
        data.storeId,
        "開始残高を設定",
        `opening-${data.storeId}`,
        old ?? null,
        data,
      ),
      ...state.history,
    ],
  };
}
export type LedgerRow = {
  id: string;
  date: string;
  category: string;
  description: string;
  receipt: number;
  payment: number;
  balance: number;
  source: "日報" | "手入力";
  report?: DailyReport;
  movement?: CashMovement;
};
export function ledger(state: FinanceState, storeId: StoreId): LedgerRow[] {
  const opening = state.openings.find((o) => o.storeId === storeId);
  if (!opening) return [];
  const rows: Omit<LedgerRow, "balance">[] = [
    ...state.reports
      .filter(
        (r) =>
          r.storeId === storeId && r.date >= opening.date && r.cashSales > 0,
      )
      .map((r) => ({
        id: r.id,
        date: r.date,
        category: "現金売上",
        description: "日報から自動反映",
        receipt: r.cashSales,
        payment: 0,
        source: "日報" as const,
        report: r,
      })),
    ...state.movements
      .filter(
        (m) => m.storeId === storeId && m.date >= opening.date && !m.voided,
      )
      .map((m) => ({
        id: m.id,
        date: m.date,
        category: cashCategoryLabel(m),
        description: m.description,
        receipt: m.direction === "入金" ? m.amount : 0,
        payment: m.direction === "出金" ? m.amount : 0,
        source: "手入力" as const,
        movement: m,
      })),
  ];
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.source === b.source ? 0 : a.source === "日報" ? -1 : 1),
  );
  let balance = opening.amount;
  return rows.map((row) => {
    balance += row.receipt - row.payment;
    return { ...row, balance };
  });
}
export function balanceAt(
  state: FinanceState,
  storeId: StoreId,
  date: string,
  before = false,
): number | null {
  const opening = state.openings.find((o) => o.storeId === storeId);
  if (!opening || date < opening.date) return null;
  const rows = ledger(state, storeId).filter((r) =>
    before ? r.date < date : r.date <= date,
  );
  return rows.at(-1)?.balance ?? opening.amount;
}
export function monthDays(month: string) {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
}
export function monthShift(month: string, n: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
export function monthDates(month: string, end: number) {
  return Array.from(
    { length: end },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
export function percentage(current: number, prior: number): number | null {
  return prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null;
}
export function monthlySummary(
  state: FinanceState,
  ids: readonly StoreId[],
  month: string,
  now = today(),
) {
  monthSchema.parse(month);
  const previousMonth = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const cutoff =
    month > now.slice(0, 7)
      ? 0
      : month === now.slice(0, 7)
        ? Number(now.slice(8, 10))
        : monthDays(month);
  const previousCutoff = Math.min(cutoff, monthDays(previousMonth));
  function period(m: string, days: number) {
    const dates = monthDates(m, days),
      set = new Set(dates);
    const reports = state.reports.filter(
      (r) => ids.includes(r.storeId) && set.has(r.date),
    );
    const missing = ids.flatMap((storeId) =>
      dates
        .filter(
          (date) =>
            !reports.some((r) => r.storeId === storeId && r.date === date),
        )
        .map((date) => ({ storeId, date })),
    );
    const sales = reports.reduce(
      (sum, r) => sum + r.cashSales + r.cashlessSales,
      0,
    );
    const minutes = reports.reduce((sum, r) => sum + r.laborMinutes, 0);
    return {
      month: m,
      days,
      reports,
      missing,
      sales,
      minutes,
      expected: days * ids.length,
      productivity: minutes ? Math.round((sales * 60) / minutes) : null,
    };
  }
  const current = period(month, cutoff),
    prior = period(previousMonth, previousCutoff);
  const comparable =
    cutoff > 0 && !current.missing.length && !prior.missing.length;
  return {
    current,
    prior,
    comparable,
    salesChange: comparable ? percentage(current.sales, prior.sales) : null,
    laborChange: comparable ? percentage(current.minutes, prior.minutes) : null,
  };
}
export function cumulative(
  state: FinanceState,
  storeIds: readonly StoreId[],
  month: string,
  end: number,
  metric: "sales" | "labor",
) {
  let total = 0,
    complete = true;
  return monthDates(month, Math.min(end, monthDays(month))).map((date) => {
    const reports = state.reports.filter(
      (r) => storeIds.includes(r.storeId) && r.date === date,
    );
    complete = complete && reports.length === storeIds.length;
    total += reports.reduce(
      (s, r) =>
        s +
        (metric === "sales" ? r.cashSales + r.cashlessSales : r.laborMinutes),
      0,
    );
    return complete ? total : null;
  });
}
export function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}
export function hours(value: number) {
  return `${Math.floor(value / 60).toLocaleString("ja-JP")}時間${value % 60 ? `${value % 60}分` : ""}`;
}
export function createFinanceSeed(now = today()): FinanceState {
  const month = now.slice(0, 7),
    year = Number(month.slice(0, 4)),
    prior = `${year - 1}${month.slice(4)}`;
  const state: FinanceState = {
    version: 1,
    targets: [],
    reports: [],
    movements: [],
    openings: stores.map((s) => ({
      storeId: s.id,
      date: `${prior}-01`,
      amount: 50_000,
    })),
    history: [],
  };
  for (const s of stores)
    for (const m of [prior, month]) {
      const end = m === month ? Number(now.slice(8, 10)) : monthDays(m);
      for (const date of monthDates(m, end)) {
        const day = Number(date.slice(8, 10)),
          closed = day % 7 === 2,
          past = m === prior,
          multiplier = s.id === "honten" ? 1 : 0.8;
        const cashSales = closed
          ? 0
          : Math.round(
              (34000 + (day % 5) * 3500) * (past ? 0.92 : 1) * multiplier,
            );
        const cashlessSales = closed
          ? 0
          : Math.round(
              (56000 + (day % 4) * 4800) * (past ? 0.9 : 1) * multiplier,
            );
        const id = `finance-sample-${s.id}-${date}`;
        state.reports.push({
          id,
          revision: 1,
          updatedAt: `${date}T12:00:00Z`,
          storeId: s.id,
          date,
          businessStatus: closed ? "休業" : "営業",
          cashSales,
          cashlessSales,
          laborMinutes: closed ? 0 : (past ? 2040 : 1920) + (day % 3) * 30,
          memo: closed
            ? "サンプル：定休日。"
            : "サンプル：おすすめの声かけをチームで共有できました。",
          countedCash: null,
        });
        if (cashSales)
          state.movements.push({
            id: `bank-${id}`,
            revision: 1,
            updatedAt: `${date}T12:00:00Z`,
            storeId: s.id,
            date,
            direction: "出金",
            category: "銀行入金",
            amount: cashSales,
            description: "サンプル：売上現金を銀行へ入金",
            voided: false,
            voidReason: "",
          });
      }
    }
  return state;
}
