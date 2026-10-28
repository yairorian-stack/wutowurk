import { describe, expect, it } from "vitest";
import { parseShiftCsv, shiftTime, shiftTotals } from "../../src/lib/shifts";
const header = "店舗,日付,表示名,開始,終了,休憩分\n";
describe("シフトCSVの検証と予定時間", () => {
  it("2店舗・引用符・BOMを読み、休憩を除いた予定時間を集計する", () => {
    const shifts = parseShiftCsv(
      "\ufeff" +
        header +
        '本店,2026-10-25,"スタッフ,A",10:00,16:00,30\r\n羽ノ浦店,2026-10-25,スタッフB,17:00,22:00,45',
    );
    expect(shiftTotals(shifts)).toEqual({ count: 2, people: 2, minutes: 585 });
  });
  it("翌日終了と複数勤務を扱う", () => {
    const shifts = parseShiftCsv(
      header +
        "本店,2026-10-25,A,22:00,26:00,30\n本店,2026-10-26,A,10:00,14:00,0",
    );
    expect(shiftTotals(shifts).minutes).toBe(450);
    expect(shiftTime(shifts[0].end)).toBe("翌02:00");
  });
  it.each([
    "本店,2026-10-25,A,10:00,16:00,30\n羽ノ浦店,2026-10-25,A,15:00,18:00,0",
    "本店,2026-10-25,A,22:00,26:00,0\n本店,2026-10-26,A,01:00,03:00,0",
    "本店,2026-10-25,A,10:00,16:00,30\n本店,2026-10-25,A,10:00,16:00,30",
  ])("日付・店舗をまたぐ同一人物の勤務重複を拒否する", (text) => {
    expect(() => parseShiftCsv(header + text)).toThrow("重複");
  });
  it.each([
    "本店,2026-02-30,A,10:00,16:00,30",
    "不明,2026-10-25,A,10:00,16:00,30",
    "本店,2026-10-25,A,16:00,10:00,0",
    "本店,2026-10-25,A,10:00,16:00,360",
    "本店,2026-10-25,A,10:60,16:00,0",
    "本店,2026-10-25,A,10:00,16:00,-1",
    "本店,2026-10-25,A,10:00,48:00,0",
    '本店,2026-10-25,"A,10:00,16:00,0',
  ])("不正データを拒否して部分取込をしない", (text) => {
    expect(() => parseShiftCsv(header + text)).toThrow();
  });
});
