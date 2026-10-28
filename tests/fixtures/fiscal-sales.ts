// Fictional amounts only. Full fiscal calendar, no real source identifiers or records.
import type { FiscalSalesLayout } from "../../src/lib/sheets-import";
export const fiscalConfig:FiscalSalesLayout={fiscalYearStart:2026,firstDataRow:3,lastDataRow:368};
export function fiscalFixture(entries:Record<string,{honten?:number|null;hanoura?:number|null;hontenHours?:number|null;hanouraHours?:number|null}>={},year=2026){
  const header=["日程","本店売上高","本店月累計","昨年対比","羽ノ浦売上高","羽ノ浦月累計","昨年対比","当日合計","昨年対比","本店労時","羽ノ浦労時"];
  const formatted:unknown[][]=[[...header],[]],effective:unknown[][]=[[...header],[]];
  const totals=new Map<string,number>();
  for(let time=Date.UTC(year,7,1);time<=Date.UTC(year+1,6,31);time+=86400000){
    const date=new Date(time),iso=date.toISOString().slice(0,10),entry=entries[iso];
    const label=`${date.getUTCMonth()+1}月${date.getUTCDate()}日（${"日月火水木金土"[date.getUTCDay()]}）`;
    const row:unknown[]=[label,null,0,0,null,0,0,0,0,null,null];
    for(const [key,column,cumulative,hours,hoursKey]of [["honten",1,2,9,"hontenHours"],["hanoura",4,5,10,"hanouraHours"]]as const){
      const amount=entry?.[key];row[column]=amount??null;row[hours]=entry?.[hoursKey]??null;
      const monthKey=`${key}/${iso.slice(0,7)}`;
      if(typeof amount==="number"){const total=(totals.get(monthKey)??0)+amount;totals.set(monthKey,total);row[cumulative]=total;}
    }
    effective.push(row);
    formatted.push(row.map((v,i)=>i===0?v:typeof v==="number"?v.toLocaleString("ja-JP"):""));
  }
  return {formatted,effective};
}
