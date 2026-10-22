import { describe, expect, it } from "vitest";
import {
  balanceAt,
  financeSchema,
  ledger,
  saveCash,
  saveDailyEntry,
  saveMonthlyTarget,
  type CashInput,
  type DailyInput,
  type FinanceState,
} from "../../src/lib/finance";
import { monthlyTargetProgress } from "../../src/lib/finance-targets";

const now = "2026-10-22";
const company = { role: "company" as const, storeId: "honten" as const };
const fresh = (): FinanceState => ({
  version: 1,
  targets: [],
  reports: [],
  movements: [],
  openings: [
    { storeId: "honten", date: "2026-10-01", amount: 30000 },
    { storeId: "816", date: "2026-10-01", amount: 10000 },
  ],
  history: [],
});
const daily: DailyInput = {
  storeId: "honten",
  date: "2026-10-01",
  businessStatus: "営業",
  cashSales: 20000,
  cashlessSales: 30000,
  laborMinutes: 600,
  memo: "架空の日報",
  countedCash: null,
};
const expense: CashInput = {
  storeId: "honten",
  date: "2026-10-01",
  direction: "出金",
  category: "仕入れ",
  amount: 3000,
  description: "架空の仕入れ",
  receiptAmount: 3000,
  receiptDescription: "架空のレシート",
};
const goal = {
  storeId: "honten" as const,
  month: "2026-10",
  salesTarget: 100000,
  productivityTarget: 5000,
};

describe("日報の1回入力", () => {
  it("日報・明細・監査履歴をまとめ、売上やレシートを二重計上しない", () => {
    const s = saveDailyEntry(
      fresh(),
      company,
      daily,
      [{ input: expense }],
      undefined,
      now,
    );
    expect(s.reports).toHaveLength(1);
    expect(s.movements).toHaveLength(1);
    expect(s.history).toHaveLength(2);
    expect(balanceAt(s, "honten", daily.date)).toBe(47000);
    expect(ledger(s, "honten").map((r) => r.receipt)).toEqual([20000, 0]);
    const p = monthlyTargetProgress(
      saveMonthlyTarget(s, company, goal),
      ["honten"],
      goal.month,
      now,
    );
    expect(p.current.sales).toBe(50000);
    expect(p.productivity).toBe(5000);
    expect(p.salesPercent).toBe(50);
  });
  it("明細の入力不備では元の日報・残高・履歴を変えない", () => {
    const s = fresh(),
      snapshot = structuredClone(s);
    expect(() =>
      saveDailyEntry(
        s,
        company,
        daily,
        [{ input: expense }, { input: { ...expense, amount: -1 } }],
        undefined,
        now,
      ),
    ).toThrow("現金明細2");
    expect(s).toEqual(snapshot);
  });
  it("訂正時は同じ明細を置換し、二重に追加しない", () => {
    const s = saveDailyEntry(
        fresh(),
        company,
        daily,
        [{ input: expense }],
        undefined,
        now,
      ),
      r = s.reports[0],
      m = s.movements[0];
    const next = saveDailyEntry(
      s,
      company,
      { ...daily, cashSales: 25000 },
      [
        {
          input: { ...expense, amount: 4000 },
          edit: { id: m.id, revision: m.revision },
        },
      ],
      { id: r.id, revision: r.revision },
      now,
    );
    expect(next.reports).toHaveLength(1);
    expect(next.movements).toHaveLength(1);
    expect(balanceAt(next, "honten", daily.date)).toBe(51000);
  });
  it("古い明細の訂正は日報の更新ごと拒否する", () => {
    const s = saveDailyEntry(
        fresh(),
        company,
        daily,
        [{ input: expense }],
        undefined,
        now,
      ),
      r = s.reports[0],
      m = s.movements[0];
    const latest = saveCash(
      s,
      company,
      { ...expense, amount: 5000 },
      { id: m.id, revision: m.revision },
      now,
    );
    const snapshot = structuredClone(latest);
    expect(() =>
      saveDailyEntry(
        latest,
        company,
        { ...daily, cashSales: 99000 },
        [{ input: expense, edit: { id: m.id, revision: m.revision } }],
        { id: r.id, revision: r.revision },
        now,
      ),
    ).toThrow("変更");
    expect(latest).toEqual(snapshot);
  });
  it("別店舗・別日の明細を混在させず、他店管理者・スタッフを拒否する", () => {
    for (const input of [
      { ...expense, storeId: "816" as const },
      { ...expense, date: "2026-10-02" },
    ])
      expect(() =>
        saveDailyEntry(fresh(), company, daily, [{ input }], undefined, now),
      ).toThrow("同じ店舗・日付");
    for (const session of [
      { role: "staff" as const, storeId: "honten" as const },
      { role: "manager" as const, storeId: "816" as const },
    ])
      expect(() =>
        saveDailyEntry(
          fresh(),
          session,
          daily,
          [{ input: expense }],
          undefined,
          now,
        ),
      ).toThrow("権限");
  });
});

describe("月次目標と人時売上高", () => {
  it("旧保存データは既存記録を維持して目標未設定として読み込む", () => {
    const s = saveDailyEntry(fresh(), company, daily, [], undefined, now);
    const legacy: Partial<FinanceState> = structuredClone(s);
    delete legacy.targets;
    const result = financeSchema.parse(legacy);
    expect(result.targets).toEqual([]);
    expect(result.reports).toEqual(s.reports);
    expect(result.history).toEqual(s.history);
  });
  it("1店舗1月の目標、版管理、変更前後の履歴を維持する", () => {
    const s = saveMonthlyTarget(fresh(), company, goal),
      t = s.targets[0];
    expect(() => saveMonthlyTarget(s, company, goal)).toThrow("設定済み");
    const next = saveMonthlyTarget(
      s,
      company,
      { ...goal, salesTarget: 200000 },
      { id: t.id, revision: t.revision },
    );
    expect(next.targets).toHaveLength(1);
    expect(next.targets[0].revision).toBe(2);
    expect(next.history[0].before).toEqual(t);
    expect(() =>
      saveMonthlyTarget(next, company, goal, {
        id: t.id,
        revision: t.revision,
      }),
    ).toThrow("変更");
    expect(() =>
      saveMonthlyTarget(
        next,
        company,
        { ...goal, month: "2026-11" },
        { id: t.id, revision: 2 },
      ),
    ).toThrow("店舗・月");
    expect(
      financeSchema.safeParse({
        ...next,
        targets: [...next.targets, { ...next.targets[0], id: "duplicate" }],
      }).success,
    ).toBe(false);
  });
  it("スタッフ・他店管理者を拒否し、自店管理者は未来月の目標を設定できる", () => {
    for (const session of [
      { role: "staff" as const, storeId: "honten" as const },
      { role: "manager" as const, storeId: "816" as const },
    ])
      expect(() => saveMonthlyTarget(fresh(), session, goal)).toThrow("権限");
    const s = saveMonthlyTarget(
      fresh(),
      { role: "manager", storeId: "honten" },
      { ...goal, month: "2026-11" },
    );
    expect(s.targets[0].month).toBe("2026-11");
  });
  it("0・負数・小数の目標、不正月を拒否する", () => {
    for (const patch of [
      { salesTarget: 0 },
      { salesTarget: -1 },
      { salesTarget: 1.5 },
      { productivityTarget: 0 },
      { productivityTarget: 1.5 },
      { month: "2026-13" },
    ])
      expect(() =>
        saveMonthlyTarget(fresh(), company, { ...goal, ...patch }),
      ).toThrow();
  });
  it("人時は合計売上÷合計時間で計算し、100%を超える実数を保持する", () => {
    let s = saveDailyEntry(fresh(), company, daily, [], undefined, now);
    s = saveDailyEntry(
      s,
      company,
      {
        ...daily,
        date: "2026-10-02",
        cashSales: 50000,
        cashlessSales: 0,
        laborMinutes: 60,
      },
      [],
      undefined,
      now,
    );
    s = saveMonthlyTarget(s, company, { ...goal, salesTarget: 50000 });
    const p = monthlyTargetProgress(s, ["honten"], goal.month, now);
    expect(p.productivity).toBeCloseTo(100000 / 11);
    expect(p.salesPercent).toBe(200);
    expect(p.remainingSales).toBe(0);
    expect(p.laborBudgetMinutes).toBe(600);
    expect(p.current.missing.length).toBe(20);
  });
  it("労働時間0や未来月では人時を未算出とし、目標未設定も0とみなさない", () => {
    const noGoal = monthlyTargetProgress(fresh(), ["honten"], goal.month, now);
    expect(noGoal.salesTarget).toBeNull();
    expect(noGoal.salesPercent).toBeNull();
    const s = saveMonthlyTarget(fresh(), company, goal);
    const p = monthlyTargetProgress(s, ["honten"], goal.month, now);
    expect(p.productivity).toBeNull();
    expect(p.productivityPercent).toBeNull();
    expect(
      monthlyTargetProgress(s, ["honten"], "2026-11", now).current.days,
    ).toBe(0);
  });
  it("全社は全店の目標が必要で、人時目標を単純平均しない", () => {
    const s = saveMonthlyTarget(fresh(), company, goal);
    expect(
      monthlyTargetProgress(s, ["honten", "816"], goal.month, now).ready,
    ).toBe(false);
    const next = saveMonthlyTarget(s, company, {
      storeId: "816",
      month: goal.month,
      salesTarget: 300000,
      productivityTarget: 10000,
    });
    const p = monthlyTargetProgress(next, ["honten", "816"], goal.month, now);
    expect(p.ready).toBe(true);
    expect(p.salesTarget).toBe(400000);
    expect(p.productivityTarget).toBe(8000);
    expect(p.laborBudgetMinutes).toBe(3000);
    expect(
      monthlyTargetProgress(next, ["816"], goal.month, now).salesTarget,
    ).toBe(300000);
  });
});
