export type StaffAccessRow = {
  email: string;
  display_name: string;
  job_title: "総合責任者" | "店長業務" | "社員" | "パートアルバイト" | "他メンバー";
  role: "staff" | "manager" | "company" | "system";
  store_id: "honten" | "816" | null;
  enabled: boolean;
  read_all_stores: boolean;
};

const headers = [
  "メールアドレス",
  "氏名",
  "役職",
  "所属店舗",
  "権限",
  "閲覧範囲",
  "有効/無効",
] as const;
const jobTitles = new Set([
  "総合責任者",
  "店長業務",
  "社員",
  "パートアルバイト",
  "他メンバー",
]);
const roles = new Map<string, StaffAccessRow["role"]>([
  ["一般スタッフ", "staff"],
  ["staff", "staff"],
  ["店舗管理者", "manager"],
  ["manager", "manager"],
  ["全社管理者", "company"],
  ["company", "company"],
  ["システム管理者", "system"],
  ["system", "system"],
]);
const enabledValues = new Map<string, boolean>([
  ["有効", true],
  ["true", true],
  ["1", true],
  ["無効", false],
  ["false", false],
  ["0", false],
]);

const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const fail = (): never => {
  throw new Error("SOURCE_VALIDATION_FAILED");
};
const store = (value: string) => {
  if (["本店", "本店のみ", "honten"].includes(value)) return "honten" as const;
  if (["羽ノ浦店", "羽ノ浦店のみ", "816"].includes(value)) return "816" as const;
  if (["両店舗", "全店舗", "all", ""].includes(value)) return null;
  return fail();
};

export function parseStaffAccessGrid(grid: unknown[][]): StaffAccessRow[] {
  if (!Array.isArray(grid) || !grid.length || grid.length > 501) return fail();
  const actualHeaders = headers.map((_, index) => text(grid[0]?.[index]));
  if (actualHeaders.some((value, index) => value !== headers[index])) return fail();
  const rows: StaffAccessRow[] = [];
  const emails = new Set<string>();
  for (const source of grid.slice(1)) {
    const cells = headers.map((_, index) => text(source?.[index]));
    if (cells.every((value) => !value)) continue;
    const [rawEmail, displayName, jobTitle, rawStore, rawRole, rawScope, rawEnabled] = cells;
    const email = rawEmail.toLowerCase();
    const role = roles.get(rawRole);
    const enabled = enabledValues.get(rawEnabled.toLowerCase());
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      emails.has(email) ||
      !displayName ||
      displayName.length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(displayName) ||
      !jobTitles.has(jobTitle) ||
      !role ||
      enabled === undefined
    )
      return fail();
    const storeId = store(rawStore);
    const scope = store(rawScope);
    if (
      ((role === "staff" || role === "manager") &&
        (!storeId || !rawScope || (scope !== null && scope !== storeId))) ||
      ((role === "company" || role === "system") &&
        (storeId !== null || scope !== null))
    )
      return fail();
    emails.add(email);
    rows.push({
      email,
      display_name: displayName,
      job_title: jobTitle as StaffAccessRow["job_title"],
      role,
      store_id: storeId,
      enabled,
      read_all_stores: scope === null,
    });
  }
  if (
    !rows.length ||
    !rows.some(
      (row) => row.enabled && (row.role === "company" || row.role === "system"),
    )
  )
    return fail();
  return rows;
}
