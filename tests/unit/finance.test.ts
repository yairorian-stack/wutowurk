import { describe, expect, it } from "vitest";
import {
  balanceAt,
  canUseFinance,
  createFinanceSeed,
  cumulative,
  financeSchema,
  hours,
  ledger,
  monthlySummary,
  percentage,
  saveCash,
  saveDaily,
  saveOpening,
  voidCash,
  type DailyInput,
  type FinanceState,
} from "../../src/lib/finance";
import { csvText } from "../../src/lib/csv";
import { type Session } from "../../src/lib/domain";

const session: Session = { role: "company", storeId: "honten" };
const now = "2026-10-21";
const fresh = (): FinanceState => ({
  version: 1,
  targets: [],
  reports: [],
  movements: [],
  openings: [
    { storeId: "honten", date: "2024-01-01", amount: 30000 },
    { storeId: "816", date: "2024-01-01", amount: 10000 },
  ],
  history: [],
});
const daily = (
  date = "2026-10-01",
  overrides: Partial<DailyInput> = {},
): DailyInput => ({
  storeId: "honten",
  date,
  businessStatus: "営業",
  cashSales: 20000,
  cashlessSales: 30000,
  laborMinutes: 25 * 60 + 30,
  memo: "架空の振り返り",
  countedCash: null,
  ...overrides,
});
describe("日報・権限", () => {
  it("保存データの重複日報・開始残高を拒否する", () => {
    const state = createFinanceSeed(now);
    expect(
      financeSchema.safeParse({
        ...state,
        reports: [
          ...state.reports,
          { ...state.reports[0], id: "duplicate-date" },
        ],
      }).success,
    ).toBe(false);
    expect(
      financeSchema.safeParse({
        ...state,
        openings: [...state.openings, state.openings[0]],
      }).success,
    ).toBe(false);
  });
  it("サンプルはスキーマを満たし、両年の同期間が揃っている", () => {
    const state = createFinanceSeed(now);
    expect(financeSchema.safeParse(state).success).toBe(true);
    const summary = monthlySummary(state, ["honten", "816"], "2026-10", now);
    expect(summary.comparable).toBe(true);
    expect(summary.current.reports).toHaveLength(42);
    expect(summary.prior.reports).toHaveLength(42);
  });
  it.each(["staff", "manager", "company", "system"] as const)(
    "%s の財務操作範囲",
    (role) => {
      expect(canUseFinance({ role, storeId: "honten" }, "honten")).toBe(
        role !== "staff",
      );
      expect(canUseFinance({ role, storeId: "honten" }, "816")).toBe(
        role === "company" || role === "system",
      );
    },
  );
  it("一般スタッフと他店舗の管理者からの登録を拒否", () => {
    expect(() =>
      saveDaily(
        fresh(),
        { role: "staff", storeId: "honten" },
        daily(),
        undefined,
        now,
      ),
    ).toThrow("権限");
    expect(() =>
      saveCash(
        fresh(),
        { role: "manager", storeId: "816" },
        {
          storeId: "honten",
          date: "2026-10-01",
          direction: "出金",
          category: "仕入",
          amount: 100,
          description: "サンプル",
        },
        undefined,
        now,
      ),
    ).toThrow("権限");
  });
  it("同じ店舗・日付の二重登録を拒否し、他店舗の同日は許可", () => {
    const state = saveDaily(fresh(), session, daily(), undefined, now);
    expect(() => saveDaily(state, session, daily(), undefined, now)).toThrow(
      "登録済み",
    );
    expect(
      saveDaily(
        state,
        session,
        daily(undefined, { storeId: "816" }),
        undefined,
        now,
      ).reports,
    ).toHaveLength(2);
  });
  it("更新時は現金売上を置き換え、履歴には変更前後を残す", () => {
    const state = saveDaily(fresh(), session, daily(), undefined, now),
      old = state.reports[0];
    const updated = saveDaily(
      state,
      session,
      { ...old, cashSales: 25000 },
      { id: old.id, revision: old.revision },
      now,
    );
    expect(updated.reports).toHaveLength(1);
    expect(ledger(updated, "honten")).toHaveLength(1);
    expect(balanceAt(updated, "honten", "2026-10-01")).toBe(55000);
    expect(updated.history[0].before).toMatchObject({ cashSales: 20000 });
    expect(updated.history[0].after).toMatchObject({ cashSales: 25000 });
    expect(state.reports[0].cashSales).toBe(20000);
  });
  it("日付・店舗のすり替えと古い版での更新を拒否", () => {
    const state = saveDaily(fresh(), session, daily(), undefined, now),
      r = state.reports[0];
    expect(() =>
      saveDaily(
        state,
        session,
        { ...r, date: "2026-10-02" },
        { id: r.id, revision: 1 },
        now,
      ),
    ).toThrow("変更できません");
    expect(() =>
      saveDaily(state, session, r, { id: r.id, revision: 2 }, now),
    ).toThrow("変更されました");
    expect(() =>
      saveDaily(
        state,
        session,
        { ...r, storeId: "816" },
        { id: r.id, revision: 1 },
        now,
      ),
    ).toThrow("変更できません");
  });
  it.each([
    { cashSales: -1 },
    { cashSales: 0.5 },
    { laborMinutes: 1.2 },
    { date: "2026-10-22" },
  ])("不正な入力 %j を拒否", (overrides) => {
    expect(() =>
      saveDaily(fresh(), session, daily(undefined, overrides), undefined, now),
    ).toThrow();
  });
  it("休業日は売上0を要求し、研修の労働時間は許可", () => {
    expect(() =>
      saveDaily(
        fresh(),
        session,
        daily(undefined, { businessStatus: "休業" }),
        undefined,
        now,
      ),
    ).toThrow("0円");
    const s = saveDaily(
      fresh(),
      session,
      daily(undefined, {
        businessStatus: "休業",
        cashSales: 0,
        cashlessSales: 0,
        laborMinutes: 120,
      }),
      undefined,
      now,
    );
    expect(s.reports[0].laborMinutes).toBe(120);
  });
  it("24時間を超える合計と分の端数を正確に扱う", () => {
    const s = saveDaily(fresh(), session, daily(), undefined, now);
    expect(s.reports[0].laborMinutes).toBe(1530);
    expect(hours(1530)).toBe("25時間30分");
    expect(hours(0)).toBe("0時間");
  });
});
describe("現金出納帳", () => {
  it("キャッシュレスを現金に含めず、銀行入金を店舗現金の出金にする", () => {
    let s = saveDaily(fresh(), session, daily(), undefined, now);
    s = saveCash(
      s,
      session,
      {
        storeId: "honten",
        date: "2026-10-01",
        direction: "出金",
        category: "銀行入金",
        amount: 15000,
        description: "サンプル入金",
      },
      undefined,
      now,
    );
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(35000);
    expect(ledger(s, "honten")[1].payment).toBe(15000);
    expect(s.reports[0].cashSales + s.reports[0].cashlessSales).toBe(50000);
  });
  it("売上以外の現金入金は売上を増やさない", () => {
    let s = saveDaily(fresh(), session, daily(), undefined, now);
    s = saveCash(
      s,
      session,
      {
        storeId: "honten",
        date: "2026-10-01",
        direction: "入金",
        category: "釣銭補充",
        amount: 10000,
        description: "サンプル釣銭",
      },
      undefined,
      now,
    );
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(60000);
    expect(monthlySummary(s, ["honten"], "2026-10", now).current.sales).toBe(
      50000,
    );
  });
  it("月初に前月の残高を繰り越し、店舗ごとの残高を分離", () => {
    let s = saveDaily(fresh(), session, daily("2026-09-30"), undefined, now);
    s = saveDaily(
      s,
      session,
      daily("2026-10-01", { cashSales: 1000 }),
      undefined,
      now,
    );
    expect(balanceAt(s, "honten", "2026-10-01", true)).toBe(50000);
    expect(balanceAt(s, "honten", "2026-10-01")).toBe(51000);
    expect(balanceAt(s, "816", "2026-10-01")).toBe(10000);
  });
  it("取消理由を必須とし、取消済み記録は残しつつ残高から除く", () => {
    const s = saveCash(
        fresh(),
        session,
        {
          storeId: "honten",
          date: "2026-10-01",
          direction: "出金",
          category: "仕入",
          amount: 3000,
          description: "架空の仕入",
        },
        undefined,
        now,
      ),
      m = s.movements[0];
    expect(() => voidCash(s, session, m.id, 1, "")).toThrow("取消理由");
    const next = voidCash(s, session, m.id, 1, "架空の重複記入");
    expect(next.movements[0].voided).toBe(true);
    expect(ledger(next, "honten")).toHaveLength(0);
    expect(balanceAt(next, "honten", "2026-10-01")).toBe(30000);
    expect(next.history[0].before).toMatchObject({ voided: false });
    expect(() => voidCash(next, session, m.id, 2, "再取消")).toThrow(
      "変更済み",
    );
    expect(financeSchema.safeParse(next).success).toBe(true);
  });
  it("現金明細の修正は重複せず後日の残高にも反映", () => {
    const s = saveCash(
        fresh(),
        session,
        {
          storeId: "honten",
          date: "2026-10-01",
          direction: "出金",
          category: "仕入",
          amount: 3000,
          description: "架空の仕入",
        },
        undefined,
        now,
      ),
      m = s.movements[0];
    const next = saveCash(
      s,
      session,
      { ...m, amount: 5000 },
      { id: m.id, revision: m.revision },
      now,
    );
    expect(next.movements).toHaveLength(1);
    expect(balanceAt(next, "honten", "2026-10-21")).toBe(25000);
  });
  it("開始日前の記録を拒否し、開始日を既存記録より後へ動かせない", () => {
    const s = saveDaily(fresh(), session, daily(), undefined, now);
    expect(() =>
      saveDaily(s, session, daily("2023-12-31"), undefined, now),
    ).toThrow("開始日");
    expect(() =>
      saveOpening(
        s,
        session,
        { storeId: "honten", date: "2026-10-02", amount: 20000 },
        now,
      ),
    ).toThrow("登録済み");
    expect(balanceAt(s, "honten", "2023-12-31")).toBeNull();
  });
  it("金額0の現金明細と不正な入出金・区分の組合せを拒否", () => {
    const input = {
      storeId: "honten" as const,
      date: "2026-10-01",
      direction: "入金" as const,
      category: "釣銭補充",
      amount: 0,
      description: "サンプル",
    };
    expect(() => saveCash(fresh(), session, input, undefined, now)).toThrow();
    expect(() =>
      saveCash(
        fresh(),
        session,
        { ...input, amount: 100, category: "銀行入金" },
        undefined,
        now,
      ),
    ).toThrow();
  });
});
describe("月次比較", () => {
  it("今月は当日まで、過去月は全月分で比較", () => {
    const state = createFinanceSeed(now),
      summary = monthlySummary(state, ["honten"], "2026-10", now);
    expect(summary.current.days).toBe(21);
    expect(summary.prior.days).toBe(21);
    expect(summary.prior.reports).toHaveLength(21);
    expect(monthlySummary(state, ["honten"], "2026-09", now).current.days).toBe(
      30,
    );
  });
  it("未入力と売上0を区別し、入力不足では前年比を出さない", () => {
    const s = createFinanceSeed(now),
      incomplete = {
        ...s,
        reports: s.reports.filter(
          (r) => r.id !== "finance-sample-honten-2026-10-01",
        ),
      };
    const sum = monthlySummary(incomplete, ["honten"], "2026-10", now);
    expect(sum.comparable).toBe(false);
    expect(sum.salesChange).toBeNull();
    expect(sum.current.missing).toEqual([
      { storeId: "honten", date: "2026-10-01" },
    ]);
    expect(
      cumulative(incomplete, ["honten"], "2026-10", 21, "sales").every(
        (v) => v === null,
      ),
    ).toBe(true);
    expect(
      monthlySummary(s, ["honten"], "2026-10", now).current.missing,
    ).toHaveLength(0);
  });
  it("前年ゼロで無限大の増減率を出さない", () => {
    const s = createFinanceSeed(now);
    s.reports = s.reports.map((r) =>
      r.date.startsWith("2025")
        ? { ...r, cashSales: 0, cashlessSales: 0, laborMinutes: 0 }
        : r,
    );
    const summary = monthlySummary(s, ["honten"], "2026-10", now);
    expect(summary.comparable).toBe(true);
    expect(summary.salesChange).toBeNull();
    expect(summary.laborChange).toBeNull();
    expect(percentage(150, 100)).toBe(50);
    expect(percentage(0, 100)).toBe(-100);
    expect(percentage(1, 0)).toBeNull();
  });
  it("うるう年の前年同月は28日で止める", () => {
    const s = createFinanceSeed("2024-02-29");
    const summary = monthlySummary(s, ["honten"], "2024-02", "2024-02-29");
    expect(summary.current.days).toBe(29);
    expect(summary.prior.days).toBe(28);
    expect(summary.comparable).toBe(true);
  });
  it("未来月は未到来として扱う", () => {
    const summary = monthlySummary(
      createFinanceSeed(now),
      ["honten"],
      "2026-11",
      now,
    );
    expect(summary.current.days).toBe(0);
    expect(summary.comparable).toBe(false);
    expect(summary.salesChange).toBeNull();
  });
  it("全社合計は2店舗の合計であり、他店舗は自店舗集計に混ざらない", () => {
    const s = createFinanceSeed(now),
      a = monthlySummary(s, ["honten"], "2026-10", now),
      b = monthlySummary(s, ["816"], "2026-10", now),
      all = monthlySummary(s, ["honten", "816"], "2026-10", now);
    expect(all.current.sales).toBe(a.current.sales + b.current.sales);
    expect(all.current.minutes).toBe(a.current.minutes + b.current.minutes);
  });
});
describe("Excel向けCSV", () => {
  it("BOMと引用符を使い、メモの式実行を防ぐ", () => {
    const csv = csvText(
      ["メモ", "金額"],
      [
        ["=1+1", 1000],
        ['改行\nと"引用"', -300],
        [" @SUM(A1)", 0],
      ],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=1+1","1000"');
    expect(csv).toContain('"改行\nと""引用"""');
    expect(csv).toContain('"\' @SUM(A1)"');
    expect(csv).toContain('"-300"');
  });
});
