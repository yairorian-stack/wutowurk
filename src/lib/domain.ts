import { z } from "zod";

export const stores = [
  {
    id: "honten",
    name: "WUTO-WURK 本店",
    short: "本店",
    subtitle: "阿南から、心に残る一皿を。",
  },
  {
    id: "816",
    name: "WUTO-WURK 羽ノ浦店（816）",
    short: "羽ノ浦店",
    subtitle: "食卓を囲む、しあわせな時間。",
  },
] as const;
export type StoreId = (typeof stores)[number]["id"];
export const roles = {
  staff: "一般スタッフ",
  manager: "店舗管理者",
  company: "全社管理者",
  system: "システム管理者",
} as const;
export type Role = keyof typeof roles;
export const statuses = ["未着手", "進行中", "完了", "保留"] as const;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "正しい日付を入力してください");
export const goalInputSchema = z
  .object({
    storeId: z.enum(["honten", "816"]),
    week: dateSchema,
    title: z.string().trim().min(1, "今週の目標を入力してください").max(100),
    action: z.string().trim().min(1, "具体的な行動を入力してください").max(600),
    assignee: z.string().trim().min(1, "担当者を入力してください").max(50),
    due: dateSchema,
    status: z.enum(statuses),
    outcome: z.string().trim().max(800),
    reflection: z.string().trim().max(800),
    nextStep: z.string().trim().max(800),
  })
  .refine(
    (v) => dateSchema.safeParse(v.week).success && weekStart(v.week) === v.week,
    { message: "対象週は月曜日を指定してください", path: ["week"] },
  )
  .refine((v) => v.due >= v.week && v.due <= addDays(v.week, 6), {
    message: "期限は対象週の中で指定してください",
    path: ["due"],
  });
export type GoalInput = z.infer<typeof goalInputSchema>;
export type Goal = GoalInput & {
  id: string;
  sourceId?: string;
  updatedAt: string;
};
export type Audit = {
  id: string;
  at: string;
  actor: string;
  operation: string;
  entityId: string;
  before: Goal | Vision | null;
  after: Goal | Vision | null;
};
export const visionSchema = z
  .object({
    id: z.string(),
    start: z.number().int().min(2026).max(2100),
    end: z.number().int().min(2026).max(2100),
    title: z.string().trim().min(1).max(80),
    countries: z.number().int().min(1).max(100),
    state: z.string().trim().min(1).max(600),
    goal: z.string().trim().min(1).max(600),
    action: z.string().trim().min(1).max(600),
    metric: z.string().trim().min(1).max(600),
    gate: z.string().trim().min(1).max(600),
  })
  .refine((v) => v.start <= v.end, "開始年は終了年以前にしてください");
export type Vision = z.infer<typeof visionSchema>;
export type Session = { role: Role; storeId: StoreId; readAllStores?: boolean };
export type PortalState = {
  version: 1;
  goals: Goal[];
  visions: Vision[];
  history: Audit[];
  session: Session;
};
export const sessionSchema = z.object({
  role: z.enum(["staff", "manager", "company", "system"]),
  storeId: z.enum(["honten", "816"]),
  readAllStores: z.boolean().optional(),
});
export const portalSchema = z.object({
  version: z.literal(1),
  goals: z.array(
    goalInputSchema.and(
      z.object({
        id: z.string(),
        sourceId: z.string().optional(),
        updatedAt: z.string(),
      }),
    ),
  ),
  visions: z.array(visionSchema),
  history: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      actor: z.string(),
      operation: z.string(),
      entityId: z.string(),
      before: z
        .union([
          goalInputSchema.and(
            z.object({
              id: z.string(),
              updatedAt: z.string(),
              sourceId: z.string().optional(),
            }),
          ),
          visionSchema,
        ])
        .nullable(),
      after: z
        .union([
          goalInputSchema.and(
            z.object({
              id: z.string(),
              updatedAt: z.string(),
              sourceId: z.string().optional(),
            }),
          ),
          visionSchema,
        ])
        .nullable(),
    }),
  ),
  session: sessionSchema,
});

// Civil date helpers use UTC arithmetic; the default date is always Asia/Tokyo.
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function shortDate(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
export function weekLabel(week: string) {
  return `${shortDate(week)}（月）— ${shortDate(addDays(week, 6))}（日）`;
}
export function isGlobal(role: Role) {
  return role === "company" || role === "system";
}
export function canRead(session: Session, storeId: StoreId) {
  return isGlobal(session.role) || session.readAllStores === true || session.storeId === storeId;
}
export function canEdit(session: Session, storeId: StoreId) {
  return isGlobal(session.role) || (session.role === "manager" && session.storeId === storeId);
}
export function completion(goals: Goal[]) {
  return goals.length
    ? Math.round(
        (goals.filter((g) => g.status === "完了").length / goals.length) * 100,
      )
    : 0;
}
function audit(
  operation: string,
  session: Session,
  before: Goal | Vision | null,
  after: Goal | Vision,
): Audit {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: `${roles[session.role]}（デモ）`,
    operation,
    entityId: after.id,
    before,
    after,
  };
}
export function saveGoal(
  state: PortalState,
  input: GoalInput,
  id?: string,
): PortalState {
  const parsed = goalInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const data = parsed.data;
  if (!canEdit(state.session, data.storeId))
    throw new Error("この店舗の目標を編集する権限がありません");
  const old = id ? state.goals.find((g) => g.id === id) : undefined;
  if (id && !old) throw new Error("目標が見つかりません");
  if (
    old &&
    (!canEdit(state.session, old.storeId) ||
      old.storeId !== data.storeId ||
      old.week !== data.week)
  )
    throw new Error("既存目標の店舗・対象週は変更できません");
  if (
    !id &&
    state.goals.filter(
      (g) => g.storeId === data.storeId && g.week === data.week,
    ).length >= 3
  )
    throw new Error("1店舗・1週間の目標は3件までです");
  const goal: Goal = {
    ...data,
    id: id ?? crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    ...(old?.sourceId ? { sourceId: old.sourceId } : {}),
  };
  return {
    ...state,
    goals: old
      ? state.goals.map((g) => (g.id === id ? goal : g))
      : [...state.goals, goal],
    history: [
      audit(
        old ? "目標を更新" : "目標を作成",
        state.session,
        old ?? null,
        goal,
      ),
      ...state.history,
    ],
  };
}
export function transferGoals(
  state: PortalState,
  storeId: StoreId,
  fromWeek: string,
  toWeek: string,
  unfinishedOnly: boolean,
): PortalState {
  if (!canEdit(state.session, storeId))
    throw new Error("この店舗の目標を編集する権限がありません");
  if (fromWeek === toWeek || weekStart(toWeek) !== toWeek)
    throw new Error("移行先の週が正しくありません");
  const existing = state.goals.filter(
    (g) => g.storeId === storeId && g.week === toWeek,
  );
  const source = state.goals.filter(
    (g) =>
      g.storeId === storeId &&
      g.week === fromWeek &&
      (!unfinishedOnly || g.status !== "完了") &&
      !existing.some((e) => e.sourceId === g.id),
  );
  if (!source.length)
    throw new Error("移行できる目標がありません（移行済み、または対象なし）");
  if (existing.length + source.length > 3)
    throw new Error("移行先が3件を超えます。登録済みの目標を確認してください");
  const copies = source.map((g) => ({
    ...g,
    id: crypto.randomUUID(),
    sourceId: g.id,
    week: toWeek,
    due: addDays(
      toWeek,
      Math.round((Date.parse(g.due) - Date.parse(g.week)) / 86400000),
    ),
    status: "未着手" as const,
    outcome: "",
    reflection: "",
    nextStep: "",
    updatedAt: new Date().toISOString(),
  }));
  return {
    ...state,
    goals: [...state.goals, ...copies],
    history: [
      ...copies.map((g) =>
        audit(
          unfinishedOnly ? "未完了を繰り越し" : "先週から複製",
          state.session,
          null,
          g,
        ),
      ),
      ...state.history,
    ],
  };
}
export function saveVision(state: PortalState, input: Vision): PortalState {
  if (!isGlobal(state.session.role))
    throw new Error("ビジョンの編集には全社管理者以上の権限が必要です");
  const data = visionSchema.parse(input);
  const old = state.visions.find((v) => v.id === data.id);
  if (!old) throw new Error("期間が見つかりません");
  if (
    state.visions.some(
      (v) => v.id !== data.id && data.start <= v.end && data.end >= v.start,
    )
  )
    throw new Error("ほかの期間と年が重複しています");
  return {
    ...state,
    visions: state.visions.map((v) => (v.id === data.id ? data : v)),
    history: [
      audit("ビジョンを更新", state.session, old, data),
      ...state.history,
    ],
  };
}
