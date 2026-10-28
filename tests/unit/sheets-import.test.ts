import { describe, expect, it } from "vitest";
import { japaneseSheetDate, parseSalesGrid, parseCashGrid, sheetMoney } from "../../src/lib/sheets-import";
const blocks = [{store:"honten" as const,column:0,year:2026,months:[10,11]}];
const sales = () => [["2026 本店", "売上高", "総労働時間", "人時売上高"], [], ["10月26日（月）","¥1,500","2.5"], ["10月27日（火）","",""]];
const cash = () => [["2026年10月 本店"], ["月","日","曜","科目","概要","入金額","出金額","残高"], ["","","","前月繰越","","","","1,000"], [10,26,"月","売上","架空の取込テスト",1500,"",2500], ["","","","クレジット","架空の控除","",500,2000], ["","","","入金","銀行預入","",1000,1000]];
const block = {year:2026,month:10,firstRow:1,source:"fixture",headerRows:2};
describe("非公開シート取込の厳密な解析",()=>{
  it("2026年の曜日、年またぎ、不正日付を検証する",()=>{
    expect(japaneseSheetDate("10月27日（火）",2026,[10,11])).toBe("2026-10-27");
    expect(japaneseSheetDate("1月1日（金）",2026,[12,1])).toBe("2027-01-01");
    for(const d of ["10月27日（月）","2025年10月27日（火）","11月31日","12月1日"])
      expect(()=>japaneseSheetDate(d,2026,[10,11])).toThrow();
  });
  it("金額の空欄と0円を区別し、誤った数値や数式エラーを拒否する",()=>{
    expect(sheetMoney(0)).toBe(0); expect(sheetMoney("")).toBeNull(); expect(sheetMoney("¥1,500")).toBe(1500);
    for(const value of ["1,50","#REF!","100円","1e3",1.5]) expect(()=>sheetMoney(value)).toThrow();
  });
  it("空欄は送信せず、店舗・年・重複・未来実績を検査する",()=>{
    expect(parseSalesGrid(sales(),blocks,"2026-10-27")).toEqual([{store_id:"honten",sales_date:"2026-10-26",sales_jpy:1500,labor_minutes:150}]);
    const duplicate=sales();duplicate.push(duplicate[2]); expect(()=>parseSalesGrid(duplicate,blocks,"2026-10-27")).toThrow();
    expect(()=>parseSalesGrid(sales(),[{...blocks[0],store:"816"}],"2026-10-27")).toThrow();
    expect(()=>parseSalesGrid(sales(),blocks,"2026-10-25")).toThrow();
  });
  it("出納帳の継承日付と原本の入出金を保ち、キャッシュレス控除を二重加算しない",()=>{
    const parsed=parseCashGrid(cash(),block,"2026-10-27");
    expect(parsed.opening).toBe(1000);expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.map(r=>r.transaction_date)).toEqual(Array(3).fill("2026-10-26"));
    expect(parsed.rows.at(-1)).toMatchObject({payment_jpy:1000,receipt_jpy:0,balance_jpy:1000,source_key:"fixture:6"});
    expect(parseCashGrid(cash(),block,"2026-10-27")).toEqual(parsed);
  });
  it("未記入の定型行を取引にせず、残高変化や未知の明細は黙って捨てない",()=>{
    const grid=cash();grid.push([10,27,"火","売上","","","",1000]);
    expect(parseCashGrid(grid,block,"2026-10-27").rows).toHaveLength(3);
    grid.at(-1)![7]=1001;expect(()=>parseCashGrid(grid,block,"2026-10-27")).toThrow();
  });
  it("開始残高欠落・残高不整合・年度誤り・未確認店舗を拒否する",()=>{
    const inconsistent=cash();inconsistent[4][7]=2001;expect(()=>parseCashGrid(inconsistent,block,"2026-10-27")).toThrow();
    const missing=cash();missing.splice(2,1);expect(()=>parseCashGrid(missing,block,"2026-10-27")).toThrow();
    const wrongYear=cash();wrongYear[0][0]="2025年10月 本店";expect(()=>parseCashGrid(wrongYear,block,"2026-10-27")).toThrow();
    const wrongStore=cash();wrongStore[0][0]="2026年10月 羽ノ浦";expect(()=>parseCashGrid(wrongStore,block,"2026-10-27")).toThrow();
  });
});
