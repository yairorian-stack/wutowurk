import { z } from "zod";
import { dateSchema } from "./domain";

export const AIRSHIFT_URL = "https://airshift.jp/sft/monthlyshift";
export const SHIFT_CSV_TEMPLATE =
  "\ufeff店舗,日付,表示名,開始,終了,休憩分\r\n本店,2026-10-25,スタッフA,10:00,15:00,30\r\n羽ノ浦店,2026-10-25,スタッフB,17:00,22:00,30\r\n";
export const shiftSchema = z
  .object({
    storeId: z.enum(["honten", "816"]),
    date: dateSchema,
    label: z.string().trim().min(1).max(50),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(2879),
    breakMinutes: z.number().int().min(0).max(1439),
  })
  .refine(
    (s) =>
      s.end > s.start &&
      s.end - s.start <= 1440 &&
      s.breakMinutes < s.end - s.start,
    "終了は開始より後（最大24時間）、休憩は勤務時間未満で指定してください",
  );
export type Shift = z.infer<typeof shiftSchema>;

// RFC 4180 subset: quoted cells, escaped quotes, CRLF and embedded newlines.
function csvRows(text: string): string[][] {
  if (text.length > 1_000_000)
    throw new Error("シフトCSVは1MB以内にしてください");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\ufeff/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("CSVの引用符を確認してください");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw new Error("CSVの引用符の後に不要な文字があります");
      cell += c;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function timeMinutes(value: string, allowNextDay = false) {
  if (!/^\d{1,2}:\d{2}$/.test(value))
    throw new Error("時刻は10:00の形式で指定してください");
  const [h, m] = value.split(":").map(Number);
  if (m > 59 || h > (allowNextDay ? 47 : 23))
    throw new Error("時刻の範囲を確認してください");
  return h * 60 + m;
}
export function parseShiftCsv(text: string): Shift[] {
  const rows = csvRows(text);
  if (rows[0]?.join(",") !== "店舗,日付,表示名,開始,終了,休憩分")
    throw new Error(
      "見出しは「店舗,日付,表示名,開始,終了,休憩分」にしてください。Airシフト固有のCSV形式は未対応です。",
    );
  if (rows.length < 2 || rows.length > 2001)
    throw new Error("勤務予定を1〜2,000件で指定してください");
  const shifts = rows.slice(1).map((row, i) => {
    if (row.length !== 6)
      throw new Error(`${i + 2}行目の列数を確認してください`);
    const [store, date, label, start, end, rest] = row.map((v) => v.trim());
    const storeId = (
      {
        本店: "honten",
        羽ノ浦店: "816",
        honten: "honten",
        "816": "816",
      } as Record<string, string>
    )[store];
    if (!/^\d+$/.test(rest))
      throw new Error(`${i + 2}行目の休憩分は0以上の整数にしてください`);
    const parsed = shiftSchema.safeParse({
      storeId,
      date,
      label,
      start: timeMinutes(start),
      end: timeMinutes(end, true),
      breakMinutes: Number(rest),
    });
    if (!parsed.success)
      throw new Error(`${i + 2}行目：${parsed.error.issues[0].message}`);
    return parsed.data;
  });
  return validateShifts(shifts);
}
export function validateShifts(input: unknown[]): Shift[] {
  const parsed = z.array(shiftSchema).min(1).max(2000).safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const shifts = parsed.data;
  // Compare absolute times, including overnight and cross-store double bookings.
  const byPerson = new Map<string, { start: number; end: number }[]>();
  for (const s of shifts) {
    const start = Date.parse(`${s.date}T00:00:00Z`) / 60000 + s.start,
      end = start + s.end - s.start;
    const other = byPerson.get(s.label) ?? [];
    if (other.some((p) => start < p.end && end > p.start))
      throw new Error(`${s.label}の勤務時間が重複しています（${s.date}）`);
    byPerson.set(s.label, [...other, { start, end }]);
  }
  return shifts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start - b.start ||
      a.label.localeCompare(b.label),
  );
}
export function shiftTotals(shifts: Shift[]) {
  return {
    count: shifts.length,
    people: new Set(shifts.map((s) => s.label)).size,
    minutes: shifts.reduce((n, s) => n + s.end - s.start - s.breakMinutes, 0),
  };
}
export function shiftTime(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return `${h >= 24 ? "翌" : ""}${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
