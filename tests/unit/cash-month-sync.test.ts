import { PGlite } from "@electric-sql/pglite";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
let db:PGlite;
const ids=[0,1,2,3].map(i=>`20000000-0000-4000-8000-00000000000${i}`);
async function asUser(i:number,fn:()=>Promise<void>){
  await db.exec("begin;set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids[i],JSON.stringify({amr:[{method:"otp"}],app_metadata:{provider:"email"}})]);
  try{await fn();}finally{await db.exec("rollback");}
}
beforeAll(async()=>{
  db=new PGlite();await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  for(const file of ["202610250001_membership.sql","202610260001_google_allowlist.sql","202610260002_email_otp.sql","202610260003_shared_sales.sql","202610280001_sheets_sync.sql","202610280002_cash_month_sources.sql"])await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
  for(let i=0;i<4;i++){
    const email=`cash${i}@example.invalid`;
    await db.query("insert into auth.users values($1,$2,now())",[ids[i],email]);
    if(i<3)await db.query("insert into portal_google_invitations(email,display_name,job_title,role,store_id) values($1,'架空スタッフ','社員',$2,$3)",[email,i===0?"company":"manager",i===0?null:i===1?"honten":"816"]);
  }
  await db.query("select portal_apply_sales_sync('fixture-sales',$1)",[JSON.stringify([
    {store_id:"honten",sales_date:"2026-10-01",sales_jpy:1500,labor_minutes:null},
    {store_id:"816",sales_date:"2026-10-01",sales_jpy:1000,labor_minutes:null},
  ])]);
},30000);
afterAll(async()=>{await db?.close();});
const cash=(store="816",amount=1000,date="2026-10-01")=>[{store_id:store,source_key:"fixture:6",transaction_date:date,source_order:6,category:"売上",description:"架空の店舗別明細",receipt_jpy:amount,payment_jpy:0,balance_jpy:500+amount}];
async function apply(run:string,store:string,month:string,rows=cash(store)){
  return (await db.query<{ok:boolean}>("select portal_apply_cash_month($1,$2,$3,500,$4) as ok",[run,store,month,JSON.stringify(rows)])).rows[0].ok;
}
describe("店舗・月別出納帳の原本照合と公開",()=>{
  it("10月羽ノ浦・本店を独立公開し再実行で重複しない",async()=>{
    expect(await apply("oct","816","2026-10-01")).toBe(true);
    expect(await apply("oct","honten","2026-10-01",cash("honten",1500))).toBe(true);
    expect(await apply("oct","816","2026-10-01")).toBe(true);
    expect((await db.query("select * from portal_cash_records where active")).rows).toHaveLength(2);
  });
  it("営業日報との不一致は該当月だけ停止し、前回の正常値と他店を維持する",async()=>{
    expect(await apply("bad","816","2026-10-01",cash("816",1001))).toBe(false);
    expect((await db.query<{balance_jpy:number}>("select balance_jpy from portal_cash_records where store_id='816' and active")).rows[0].balance_jpy).toBe(1500);
    expect((await db.query<{status:string}>("select status from portal_cash_sync_status where store_id='honten'")).rows[0].status).toBe("success");
    expect((await db.query<{message_code:string}>("select message_code from portal_cash_sync_status where store_id='816' and month='2026-10-01'")).rows[0].message_code).toBe("SALES_MISMATCH");
  });
  it("残高式の誤りは月内の公開行を変更しない",async()=>{
    expect(await apply("bad-balance","honten","2026-10-01",[{...cash("honten",1500)[0],balance_jpy:2001}])).toBe(false);
    expect((await db.query<{balance_jpy:number}>("select balance_jpy from portal_cash_records where store_id='honten' and active")).rows[0].balance_jpy).toBe(2000);
  });
  it("8・9月は月を読み替えず原本確認待ち、10月と売上は維持する",async()=>{
    for(const month of ["2026-08-01","2026-09-01"])expect(await apply(`blocked-${month}`,"816",month,cash("816",1000,month))).toBe(false);
    expect((await db.query("select * from portal_cash_records where month<'2026-10-01' and active")).rows).toHaveLength(0);
    expect((await db.query("select * from portal_cash_sync_status where status='blocked'")).rows).toHaveLength(2);
    expect((await db.query("select * from portal_sales_records")).rows).toHaveLength(2);
  });
  it("全社は両店、店長は自店の明細・繰越・月別警告のみ閲覧",async()=>{
    for(let i=0;i<3;i++)await asUser(i,async()=>{
      await db.query("select portal_accept_email_invitation()");
      const records=(await db.query<{store_id:string}>("select * from portal_cash_records")).rows;
      expect(new Set(records.map(r=>r.store_id))).toEqual(new Set(i===0?["honten","816"]:i===1?["honten"]:["816"]));
      const warnings=(await db.query<{store_id:string}>("select * from portal_cash_sync_status")).rows;
      if(i===1)expect(warnings.every(r=>r.store_id==="honten")).toBe(true);
      if(i===2)expect(warnings.every(r=>r.store_id==="816")).toBe(true);
    });
  });
  it("確認待ち月に古い行が残っていても、警告だけ見せて金額を非公開にする",async()=>{
    await asUser(2,async()=>{
      await db.query("select portal_accept_email_invitation()");
      await db.exec("reset role;insert into portal_cash_months values('816','2026-08-01',500,now());insert into portal_cash_records(store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy) values('816','private-fixture','2026-08-01',6,'売上','架空の保留月',1000,0,1500);set local role authenticated");
      expect((await db.query("select * from portal_cash_records where month='2026-08-01'")).rows).toHaveLength(0);
      expect((await db.query("select * from portal_cash_months where month='2026-08-01'")).rows).toHaveLength(0);
      expect((await db.query("select * from portal_cash_sync_status where month='2026-08-01'")).rows).toHaveLength(1);
    });
  });
  it("未認証・未登録・停止済み・一般スタッフを拒否し、画面から書込できない",async()=>{
    await db.exec("begin;set local role anon");try{await expect(db.query("select * from portal_cash_sync_status")).rejects.toThrow();}finally{await db.exec("rollback");}
    await asUser(3,async()=>{expect((await db.query("select * from portal_cash_records")).rows).toHaveLength(0);});
    for(const condition of ["status='disabled'","role='staff'"])await asUser(2,async()=>{
      await db.query("select portal_accept_email_invitation()");await db.exec(`reset role;update portal_members set ${condition};set local role authenticated`);
      expect((await db.query("select * from portal_cash_records")).rows).toHaveLength(0);
    });
    await asUser(0,async()=>{await db.query("select portal_accept_email_invitation()");await expect(apply("forged","816","2026-10-01")).rejects.toThrow();});
  });
});

describe("通期解析結果の日次upsert",()=>{
  it("10/25以降を再取込しても過去・出納帳が消えず、店舗日が重複しない",async()=>{
    const {fiscalFixture,fiscalConfig}=await import("../fixtures/fiscal-sales");
    const {parseFiscalSalesGrid}=await import("../../src/lib/sheets-import");
    const fixture=fiscalFixture({"2026-10-25":{honten:100},"2026-10-26":{honten:200,hanoura:300},"2026-10-27":{hanoura:400}});
    const rows=parseFiscalSalesGrid(fixture.formatted,fixture.effective,fiscalConfig,"2026-10-28");
    for(const run of ["fiscal-one","fiscal-one","fiscal-two"])await db.query("select portal_apply_sales_sync($1,$2)",[run,JSON.stringify(rows)]);
    expect((await db.query("select * from portal_sales_records")).rows).toHaveLength(6);
    expect((await db.query("select * from portal_sales_records where sales_date='2026-10-01'")).rows).toHaveLength(2);
    expect((await db.query("select * from portal_cash_records where active")).rows).toHaveLength(2);
  });
});
