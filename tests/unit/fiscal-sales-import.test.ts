import { describe,expect,it } from "vitest";
import { parseFiscalSalesGrid } from "../../src/lib/sheets-import";
import { fiscalConfig,fiscalFixture } from "../fixtures/fiscal-sales";
const parse=(fixture:ReturnType<typeof fiscalFixture>,asOf="2026-10-28")=>parseFiscalSalesGrid(fixture.formatted,fixture.effective,fiscalConfig,asOf);
const index=(date:string)=>2+(Date.parse(`${date}T00:00:00Z`)-Date.UTC(2026,7,1))/86400000;
describe("39期の縦型通期売上",()=>{
  it("10/24で止まらず25日以降の両店舗を取り込み、空欄と0円と労時欠落を区別する",()=>{
    const fixture=fiscalFixture({"2026-10-24":{honten:1000,hanoura:500},"2026-10-25":{honten:1500,hanoura:0},"2026-10-26":{honten:1600,hanoura:600,hontenHours:1.5},"2026-10-27":{hanoura:700}});
    const rows=parse(fixture);
    expect(rows).toHaveLength(7);
    expect(rows.find(r=>r.store_id==="816"&&r.sales_date==="2026-10-25")).toMatchObject({sales_jpy:0,labor_minutes:null});
    expect(rows.find(r=>r.store_id==="honten"&&r.sales_date==="2026-10-26")?.labor_minutes).toBe(90);
    expect(rows.some(r=>r.store_id==="honten"&&r.sales_date==="2026-10-27")).toBe(false);
    expect(rows.at(-1)?.sales_date).toBe("2026-10-27");
    expect(parse(fixture)).toEqual(rows);
  });
  it("11月・1月の年またぎ・7月31日まで設定変更なしで扱う",()=>{
    const fixture=fiscalFixture({"2026-08-01":{honten:100},"2026-11-01":{honten:200},"2027-01-01":{honten:300},"2027-07-31":{hanoura:400}});
    expect(parse(fixture,"2027-07-31").map(r=>r.sales_date)).toEqual(["2026-08-01","2026-11-01","2027-01-01","2027-07-31"]);
    const leap=fiscalFixture({"2028-02-29":{honten:100}},2027);
    expect(parseFiscalSalesGrid(leap.formatted,leap.effective,{...fiscalConfig,fiscalYearStart:2027},"2028-07-31")[0].sales_date).toBe("2028-02-29");
  });
  it("未来の日付に累計・比率の0があっても売上行を作らない",()=>{
    const fixture=fiscalFixture({"2026-08-01":{honten:100}});
    expect(parse(fixture)).toHaveLength(1);
    expect(parse(fixture).every(r=>r.sales_date<="2026-10-28")).toBe(true);
    const future=fiscalFixture({"2027-01-01":{honten:0}});expect(()=>parse(future)).toThrow();
  });
  it("文字列の金額・日付重複・暦/曜日不正・欠落・店舗列のずれを拒否する",()=>{
    for(const mutate of [
      (f:ReturnType<typeof fiscalFixture>)=>{f.effective[index("2026-08-01")][1]="100";},
      (f:ReturnType<typeof fiscalFixture>)=>{f.formatted[index("2026-08-02")][0]=f.formatted[index("2026-08-01")][0];},
      (f:ReturnType<typeof fiscalFixture>)=>{f.formatted[index("2026-08-01")][0]="8月1日（月）";},
      (f:ReturnType<typeof fiscalFixture>)=>{f.formatted[index("2026-09-01")]=[];f.effective[index("2026-09-01")]=[];},
      (f:ReturnType<typeof fiscalFixture>)=>{f.formatted[0][1]="羽ノ浦売上高";},
    ]){const fixture=fiscalFixture({"2026-08-01":{honten:100}});mutate(fixture);expect(()=>parse(fixture)).toThrow();}
  });
  it("有効値と表示日付を同じ行で照合し、日付シリアルにも対応する",()=>{
    const fixture=fiscalFixture({"2026-08-01":{honten:100}});
    fixture.effective[index("2026-08-01")][0]=(Date.UTC(2026,7,1)-Date.UTC(1899,11,30))/86400000;
    expect(parse(fixture)[0].sales_date).toBe("2026-08-01");
    fixture.effective[index("2026-08-01")][0]=1;expect(()=>parse(fixture)).toThrow();
  });
  it("記入済み日の月累計不整合を拒否し、空欄日の計算補助値は入力とみなさない",()=>{
    const fixture=fiscalFixture({"2026-08-01":{honten:100}});fixture.effective[2][2]=101;
    expect(()=>parse(fixture)).toThrow();
  });
});


it("同月累計の比率を百分率に変換し、計算エラーを0%に変えない",()=>{
  const fixture=fiscalFixture({"2026-10-26":{honten:100,hanoura:200}});
  fixture.effective[index("2026-10-26")][3]=1.23456;
  fixture.effective[index("2026-10-26")][6]="#ERROR!";
  const rows=parse(fixture);
  expect(rows[0].reported_yoy).toBe(123.46);
  expect(rows[1].reported_yoy).toBeNull();
});
