// Pure parsing only. No network, credentials or real source data belong here.
export type SyncSale = { store_id: "honten" | "816"; sales_date: string; sales_jpy: number; labor_minutes: number | null };
export type SyncCash = { store_id: "honten" | "816"; transaction_date: string; source_key: string; source_order: number; category: string; description: string; receipt_jpy: number; payment_jpy: number; balance_jpy: number };
export type SalesBlock = { store: "honten" | "816"; column: number; year: number; months: number[] };
const weekdays = "日月火水木金土";
function fail(): never { throw new Error("SOURCE_VALIDATION_FAILED"); }
const cell = (v: unknown) => v == null ? "" : String(v).normalize("NFKC").trim();
export function sheetMoney(v: unknown): number | null {
  const text = cell(v);
  if (!text) return null;
  if (!/^[¥￥]?\s*-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(text)) return fail();
  const n = Number(text.replace(/[¥￥,\s]/g, ""));
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10_000_000_000) return fail();
  return n;
}
export function japaneseSheetDate(value: unknown, year: number, months: number[]): string {
  const match = cell(value).match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*[（(]([日月火水木金土])(?:曜日)?[）)])?$/);
  if (!match) return fail();
  const month = Number(match[2]), day = Number(match[3]);
  if (!months.includes(month) || year < 2020 || year > 2100) return fail();
  const actualYear = year + (months.includes(12) && month === 1 ? 1 : 0);
  if (match[1] && Number(match[1]) !== actualYear) return fail();
  const iso = `${actualYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso || (match[4] && weekdays[date.getUTCDay()] !== match[4])) return fail();
  return iso;
}
export function parseSalesGrid(grid: unknown[][], blocks: SalesBlock[], asOf: string): SyncSale[] {
  const rows: SyncSale[] = [], seen = new Set<string>();
  if (grid.length < 3 || !blocks.length) return fail();
  for (const block of blocks) {
    if (!["honten", "816"].includes(block.store) || !Number.isInteger(block.column) || block.column < 0 || block.months.length !== 2) return fail();
    const header = grid.slice(0, 2).map(row => row.slice(block.column, block.column + 4).map(cell).join(" ")).join(" ");
    // Deliberately fail closed when merged/header layouts no longer identify year/store.
    if (!header.includes(String(block.year)) || !header.includes(block.store === "honten" ? "本店" : "羽ノ浦") || !header.includes("売上") || !header.includes("労働")) return fail();
    for (let index = 2; index < grid.length; index++) {
      const row = grid[index], dateCell = cell(row[block.column]);
      if (!dateCell) { if (cell(row[block.column + 1])) return fail(); continue; }
      // Only explicitly labelled summary rows can be ignored; never silently ignore malformed dates.
      if (/^(?:合計|月計|累計|平均)$/.test(dateCell)) continue;
      const date = japaneseSheetDate(dateCell, block.year, block.months);
      const amount = sheetMoney(row[block.column + 1]);
      if (amount === null) continue; // blank is unknown, never a zero or deletion
      if (amount < 0 || date > asOf) return fail();
      const key = `${block.store}/${date}`;
      if (seen.has(key)) return fail();
      seen.add(key);
      const hoursText = cell(row[block.column + 2]);
      let minutes: number | null = null;
      if (hoursText) {
        if (!/^\d+(?:\.\d{1,4})?$/.test(hoursText)) return fail();
        minutes = Math.round(Number(hoursText) * 60);
        if (minutes > 600000) return fail();
      }
      rows.push({ store_id: block.store, sales_date: date, sales_jpy: amount, labor_minutes: minutes });
    }
  }
  if (!rows.length) return fail();
  return rows;
}
export type FiscalSalesLayout = { fiscalYearStart: number; firstDataRow: number; lastDataRow: number };
// L:V: date, Honten daily/month/YoY, Hanoura daily/month/YoY, totals, YoY, store labor hours.
export function parseFiscalSalesGrid(formatted: unknown[][], effective: unknown[][], config: FiscalSalesLayout, asOf: string): SyncSale[] {
  const {fiscalYearStart:year,firstDataRow,lastDataRow}=config;
  if (!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(firstDataRow)||firstDataRow<2||!Number.isInteger(lastDataRow)||lastDataRow<firstDataRow||lastDataRow-firstDataRow>400||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return fail();
  const header=(column:number)=>formatted.slice(0,firstDataRow-1).map(r=>cell(r[column])).join("").replace(/\s/g,"");
  if (!/日程|日付/.test(header(0))||!header(1).includes("本店")||!header(1).includes("売上")||!header(4).includes("羽ノ浦")||!header(4).includes("売上")||!header(9).includes("本店")||!header(10).includes("羽ノ浦")||!(/労時|労働/.test(header(9)))||!(/労時|労働/.test(header(10)))) return fail();
  const start=`${year}-08-01`,end=`${year+1}-07-31`,dates=new Set<string>();
  const totals=new Map<string,number>(),rows:SyncSale[]=[];
  let previous="";
  for(let index=firstDataRow-1;index<lastDataRow;index++){
    const display=formatted[index]??[],raw=effective[index]??[],label=cell(display[0]);
    if(!label){if(cell(raw[1])||cell(raw[4]))return fail();continue;}
    const match=label.match(/^(?:\d{4}年)?(\d{1,2})月/);if(!match)return fail();
    const month=Number(match[1]),calendarYear=month>=8?year:year+1;
    const date=japaneseSheetDate(label,calendarYear,[month]);
    // Both representations come from one GridData response, not two snapshots.
    if(typeof raw[0]==="number"){
      if(!Number.isInteger(raw[0])||new Date(Date.UTC(1899,11,30)+raw[0]*86400000).toISOString().slice(0,10)!==date)return fail();
    }else if(cell(raw[0])!==label)return fail();
    if(date<start||date>end||date<=previous||dates.has(date))return fail();
    previous=date;dates.add(date);
    for(const [store,column,cumulativeColumn,hoursColumn] of [["honten",1,2,9],["816",4,5,10]] as const){
      const amount=raw[column];
      if(amount===null||amount===undefined||amount==="")continue; // Ignore every formula-only aggregate for a blank daily cell.
      if(typeof amount!=="number"||!Number.isSafeInteger(amount)||amount<0||amount>10000000000||date>asOf)return fail();
      const hours=raw[hoursColumn];let minutes:number|null=null;
      if(hours!==null&&hours!==undefined&&hours!==""){
        if(typeof hours!=="number"||!Number.isFinite(hours)||hours<0||hours>10000)return fail();
        minutes=Math.round(hours*60);
      }
      const key=`${store}/${date.slice(0,7)}`,total=(totals.get(key)??0)+amount;
      if(!Number.isSafeInteger(total)||total>10000000000)return fail();totals.set(key,total);
      const cumulative=raw[cumulativeColumn];
      if(cumulative!==null&&cumulative!==undefined&&cumulative!==""&&(typeof cumulative!=="number"||cumulative!==total))return fail();
      rows.push({store_id:store,sales_date:date,sales_jpy:amount,labor_minutes:minutes});
    }
  }
  const expectedDays=(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000+1;
  if(dates.size!==expectedDays||!dates.has(start)||!dates.has(end)||!rows.length)return fail();
  return rows;
}

export type CashBlock = { store?: "honten" | "816"; year: number; month: number; firstRow: number; source: string; headerRows: number;
  yearCell?: [number, number]; monthCell?: [number, number]; labelsRow?: number;
  openingValueRow?: number; firstTransactionDate?: string };

export function parseCashGrid(grid: unknown[][], block: CashBlock, asOf: string): { opening: number; rows: SyncCash[] } {
  const store = block.store ?? "honten";
  if (!["honten","816"].includes(store)) return fail();
  const header = grid.slice(0, block.headerRows).flat().map(cell).join(" ");
  if (!Number.isInteger(block.year) || block.year < 2026 || block.year > 2100 || block.month < 1 || block.month > 12 || block.headerRows < 1 || block.firstRow < 1 || !/^[a-zA-Z0-9:_-]{1,160}$/.test(block.source)) return fail();
  if (block.yearCell || block.monthCell || block.labelsRow) {
    if (!block.yearCell || !block.monthCell || !block.labelsRow) return fail();
    const [yr,yc]=block.yearCell, [mr,mc]=block.monthCell;
    if (yr<1 || mr<1 || yc<0 || mc<0 || block.labelsRow<1 || block.labelsRow>block.headerRows) return fail();
    // The explicitly reviewed year/month cells take precedence over an obsolete title year.
    if (cell(grid[yr-1]?.[yc]) !== String(block.year) || cell(grid[mr-1]?.[mc]).replace(/月$/, "") !== String(block.month)) return fail();
    const labels=["月","日","曜","科目","概要","入金額","出金額","残高"];
    if (!labels.every((v,i)=>cell(grid[block.labelsRow!-1]?.[i])===v)) return fail();
  } else if (!header.includes(String(block.year)) || !header.includes(`${block.month}月`) || !header.includes(store === "honten" ? "本店" : "816") || !["科目", "概要", "入金額", "出金額", "残高"].every(v => header.includes(v))) return fail();
  // Nine-column month range: month/day/weekday/category/description/in/out/balance/(spacer).
  const rows: SyncCash[] = [];
  let date = "", opening: number | null = null, balance: number | null = null;
  let firstBodyRow=block.headerRows;
  const reviewedSplit=store==="816" && block.year===2026 && block.month===10;
  if (reviewedSplit && block.openingValueRow!==6) return fail();
  if (block.openingValueRow!==undefined) {
    // Only the explicitly reviewed split layout is supported. Never search for an amount.
    if (!reviewedSplit || block.firstRow!==1 || block.headerRows!==4 || block.openingValueRow!==6 || block.firstTransactionDate!=="2026-10-01") return fail();
    const label=grid[4]??[], auxiliary=grid[5]??[];
    if (cell(label[0])!=="10" || cell(label[3])!=="先月繰り越し" || [1,2,4,5,6,7].some(c=>cell(label[c])!=="")) return fail();
    const receipt=sheetMoney(auxiliary[5]), reported=sheetMoney(auxiliary[7]);
    if (cell(auxiliary[0])!=="" || cell(auxiliary[1])!=="1" || !/^[日月火水木金土]$/.test(cell(auxiliary[2])) || cell(auxiliary[3])!=="" || cell(auxiliary[4])!=="" || cell(auxiliary[6])!=="" || receipt===null || receipt<0 || receipt!==reported) return fail();
    opening=receipt; balance=receipt;
    // The auxiliary row is neither a transaction nor the source of a transaction date.
    // The separately reviewed explicit date seeds subsequent undated detail rows.
    date=block.firstTransactionDate;
    firstBodyRow=6;
  } else if (block.firstTransactionDate!==undefined) return fail();
  for (let i = firstBodyRow; i < grid.length; i++) {
    const raw = grid[i], values = raw.map(cell);
    if (values.every(v => !v)) continue;
    const rawCategory = cell(raw[3]), description = cell(raw[4]);
    const category = rawCategory === "クレジットカード" ? "クレジット" : rawCategory;
    const receipt = sheetMoney(raw[5]), payment = sheetMoney(raw[6]), reported = sheetMoney(raw[7]);
    let rowDate = "";
    if (cell(raw[0]) || cell(raw[1])) {
      if (!cell(raw[1])) return fail();
      const m = cell(raw[0]) ? Number(cell(raw[0]).replace(/月$/, "")) : block.month;
      if (m !== block.month) return fail();
      rowDate = japaneseSheetDate(`${m}月${cell(raw[1]).replace(/日$/, "")}日${cell(raw[2]) ? `(${cell(raw[2])})` : ""}`, block.year, [block.month]);
    }
    const openingLabel = (category || description) === "先月繰り越し" ? "前月繰越" : category || description;
    if (/^(?:前月繰越|前月より繰越|繰越|開始残高)$/.test(openingLabel)) {
      if (rows.length || opening !== null || reported === null || receipt !== null || payment !== null) return fail();
      opening = reported; balance = reported;
      if (rowDate) date = rowDate;
      continue;
    }
    if (/^(?:合計|月計|次月繰越)$/.test(category || description)) {
      if (reported !== null && reported !== balance) return fail();
      continue;
    }
    // A reviewed month-marker row is metadata, not a dated transaction or inferred opening.
    if (block.monthCell?.[0] === i+1 && !cell(raw[1]) && !category && !description && receipt === null && payment === null && reported === null) continue;
    if (rowDate) date = rowDate;
    if (receipt === null && payment === null) {
      const futureTemplate = date > asOf && description === "後日入金" && ["阿南応援割", "食べてくクーポン"].includes(category);
      const placeholder = futureTemplate || (!description && (!category || (["売上", "クレジット", "PayPay", "後日入金券", "領収書"].includes(category) && !!date)));
      if (!placeholder || (reported !== null && reported !== balance)) return fail();
      continue;
    }
    if (!date || date > asOf || opening === null || balance === null || reported === null || !category || (receipt ?? 0) < 0 || (payment ?? 0) < 0 || (receipt ?? 0) + (payment ?? 0) === 0 || ((receipt ?? 0) > 0 && (payment ?? 0) > 0)) return fail();
    if (rows.length && date < rows[rows.length - 1].transaction_date) return fail();
    balance += (receipt ?? 0) - (payment ?? 0);
    if (balance !== reported || category.length > 100 || description.length > 500) return fail();
    rows.push({ store_id: store, transaction_date: date, source_key: `${block.source}:${block.firstRow + i}`, source_order: block.firstRow + i, category, description, receipt_jpy: receipt ?? 0, payment_jpy: payment ?? 0, balance_jpy: reported });
  }
  if (opening === null || !rows.length) return fail();
  return { opening, rows };
}

export function crossCheckCashSales(rows: SyncCash[], sales: SyncSale[]) {
  const reported = new Map(sales.map(r=>[`${r.store_id}/${r.sales_date}`,r.sales_jpy]));
  const daily = new Map<string,number>();
  for (const row of rows) {
    const key=`${row.store_id}/${row.transaction_date}`;
    daily.set(key,(daily.get(key)??0)+(row.category === "売上" ? row.receipt_jpy-row.payment_jpy : 0));
  }
  for (const [key,total] of daily) if (reported.get(key)!==total) throw new Error("SALES_MISMATCH");
}
