import { describe, expect, it } from "vitest";
import {
  addDays,
  canEdit,
  canRead,
  completion,
  dateSchema,
  goalInputSchema,
  portalSchema,
  saveGoal,
  saveVision,
  transferGoals,
  weekStart,
  type GoalInput,
  type PortalState,
  type Role,
} from "../../src/lib/domain";
import { createSeed } from "../../src/lib/seed";

const seed = () => createSeed("2026-10-21");
const input = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  storeId: "honten",
  week: "2026-10-26",
  title: "テスト目標",
  action: "具体的な行動を共有する",
  assignee: "架空担当Z",
  due: "2026-10-30",
  status: "未着手",
  outcome: "",
  reflection: "",
  nextStep: "",
  ...overrides,
});
describe("週と日付", () => {
  it.each([
    ["2026-10-21", "2026-10-19"],
    ["2026-10-25", "2026-10-19"],
    ["2026-10-26", "2026-10-26"],
    ["2027-01-01", "2026-12-28"],
  ])("%s は %s の週", (date, week) => expect(weekStart(date)).toBe(week));
  it("月末・年末を越えて移動できる", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
  it.each(["2026-02-30", "2026-13-01", "invalid", "2026-1-1"])(
    "存在しない日付 %s を拒否",
    (value) => expect(dateSchema.safeParse(value).success).toBe(false),
  );
  it("週の外の期限と月曜日以外の開始日を拒否", () => {
    expect(
      goalInputSchema.safeParse(input({ due: "2026-11-02" })).success,
    ).toBe(false);
    expect(
      goalInputSchema.safeParse(input({ week: "2026-10-27" })).success,
    ).toBe(false);
  });
});
describe("デモ用の操作スコープ", () => {
  it.each([
    ["staff", true, false, false, false],
    ["manager", true, true, false, false],
    ["company", true, true, true, true],
    ["system", true, true, true, true],
  ] as [Role, boolean, boolean, boolean, boolean][])(
    "%s の自店舗・他店舗の読み書き",
    (role, ownRead, ownEdit, otherRead, otherEdit) => {
      const session = { role, storeId: "honten" as const };
      expect(canRead(session, "honten")).toBe(ownRead);
      expect(canEdit(session, "honten")).toBe(ownEdit);
      expect(canRead(session, "816")).toBe(otherRead);
      expect(canEdit(session, "816")).toBe(otherEdit);
    },
  );
  it("一般スタッフと他店の店舗管理者からの直接更新を拒否", () => {
    const state = seed();
    expect(() =>
      saveGoal(
        { ...state, session: { role: "staff", storeId: "honten" } },
        input(),
      ),
    ).toThrow("権限");
    expect(() =>
      saveGoal(
        { ...state, session: { role: "manager", storeId: "816" } },
        input(),
      ),
    ).toThrow("権限");
  });
});
describe("目標の保存", () => {
  it("サンプル状態は保存スキーマに適合する", () =>
    expect(portalSchema.safeParse(seed()).success).toBe(true));
  it("作成と編集の前後を履歴に残し、元状態を変更しない", () => {
    const original = seed();
    const created = saveGoal(original, input());
    const goal = created.goals.at(-1)!;
    expect(original.goals).toHaveLength(8);
    expect(created.goals).toHaveLength(9);
    expect(created.history[0].before).toBeNull();
    expect(created.history[0].after?.title).toBe("テスト目標");
    const updated = saveGoal(
      created,
      { ...goal, status: "完了", outcome: "共有できました" },
      goal.id,
    );
    expect(updated.goals.at(-1)?.status).toBe("完了");
    expect(updated.history[0].before).toMatchObject({ status: "未着手" });
    expect(updated.history[0].after).toMatchObject({
      status: "完了",
      outcome: "共有できました",
    });
    expect(portalSchema.safeParse(updated).success).toBe(true);
  });
  it("週3件の制限を守り、既存の3件目は編集できる", () => {
    const state = seed();
    const goal = state.goals[0];
    expect(() =>
      saveGoal(state, input({ week: goal.week, due: goal.due })),
    ).toThrow("3件");
    expect(
      saveGoal(state, { ...goal, title: "更新した目標" }, goal.id).goals[0]
        .title,
    ).toBe("更新した目標");
  });
  it("空白の目標・担当者を拒否", () => {
    expect(() => saveGoal(seed(), input({ title: "   " }))).toThrow();
    expect(() => saveGoal(seed(), input({ assignee: "   " }))).toThrow();
  });
  it("既存目標の店舗や週のすり替えを拒否", () => {
    const state = seed();
    const goal = state.goals[0];
    expect(() => saveGoal(state, { ...goal, storeId: "816" }, goal.id)).toThrow(
      "変更できません",
    );
    expect(() =>
      saveGoal(
        state,
        { ...goal, week: addDays(goal.week, 7), due: addDays(goal.due, 7) },
        goal.id,
      ),
    ).toThrow("変更できません");
  });
  it("保留は未完了として分母に含める", () => {
    const goals = seed().goals.slice(0, 3);
    expect(completion(goals)).toBe(33);
    expect(completion(goals.map((g) => ({ ...g, status: "保留" })))).toBe(0);
    expect(completion([])).toBe(0);
  });
});
describe("複製と繰り越し", () => {
  it("先週を複製し、成果をリセット・期限を移動・元記録を保持", () => {
    const original = seed();
    const state = transferGoals(
      original,
      "honten",
      "2026-10-19",
      "2026-10-26",
      false,
    );
    const copies = state.goals.filter((g) => g.week === "2026-10-26");
    expect(copies).toHaveLength(3);
    expect(
      copies.every(
        (g) =>
          g.status === "未着手" &&
          g.outcome === "" &&
          g.sourceId &&
          g.due === "2026-11-01",
      ),
    ).toBe(true);
    expect(state.goals.filter((g) => g.week === "2026-10-19")).toEqual(
      original.goals.filter((g) => g.week === "2026-10-19"),
    );
    expect(state.history).toHaveLength(3);
    expect(() =>
      transferGoals(state, "honten", "2026-10-19", "2026-10-26", false),
    ).toThrow("移行できる目標がありません");
  });
  it("未完了だけを翌週に繰り越す", () => {
    const state = transferGoals(
      seed(),
      "honten",
      "2026-10-19",
      "2026-10-26",
      true,
    );
    const copies = state.goals.filter((g) => g.week === "2026-10-26");
    expect(copies).toHaveLength(2);
    expect(copies.map((g) => g.sourceId)).not.toContain("sample-2");
    expect(portalSchema.safeParse(state).success).toBe(true);
  });
  it("移行先の上限を超える場合、部分的に保存しない", () => {
    let state: PortalState = seed();
    state = saveGoal(state, input());
    expect(() =>
      transferGoals(state, "honten", "2026-10-19", "2026-10-26", false),
    ).toThrow("3件");
    expect(state.goals).toHaveLength(9);
  });
  it("権限のない繰越と同じ週への移行を拒否", () => {
    expect(() =>
      transferGoals(
        { ...seed(), session: { role: "staff", storeId: "honten" } },
        "honten",
        "2026-10-19",
        "2026-10-26",
        true,
      ),
    ).toThrow("権限");
    expect(() =>
      transferGoals(seed(), "honten", "2026-10-19", "2026-10-19", true),
    ).toThrow("正しくありません");
  });
});
describe("ビジョン編集", () => {
  it("管理者の更新と履歴保存", () => {
    const state = seed();
    const result = saveVision(state, {
      ...state.visions[0],
      title: "阿南モデルを一緒に育てる",
    });
    expect(result.visions[0].title).toBe("阿南モデルを一緒に育てる");
    expect(result.history[0].before?.title).toBe("阿南モデルの確立");
  });
  it("店舗管理者による編集と期間重複を拒否", () => {
    const state = seed();
    expect(() =>
      saveVision(
        { ...state, session: { role: "manager", storeId: "honten" } },
        state.visions[0],
      ),
    ).toThrow("全社管理者");
    expect(() => saveVision(state, { ...state.visions[0], end: 2030 })).toThrow(
      "重複",
    );
  });
});
