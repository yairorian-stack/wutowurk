import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const ids = Array.from({ length: 8 }, (_, i) => `10000000-0000-4000-8000-00000000000${i}`);
async function asUser(index: number, fn: () => Promise<void>, method = "oauth", provider = "google") {
  await db.exec("begin;set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
    ids[index], JSON.stringify({ amr: [{ method }], app_metadata: { provider } }),
  ]);
  try { await fn(); } finally { await db.exec("rollback"); }
}
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  for (const file of ["202610250001_membership.sql", "202610260001_google_allowlist.sql", "202610260002_email_otp.sql", "202610260003_shared_sales.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (let i = 0; i < ids.length; i++) {
    const email = `pilot${i}@example.invalid`;
    await db.query("insert into auth.users values($1,$2,$3)", [ids[i], email, i === 5 ? null : "2026-10-26T00:00:00Z"]);
    await db.query("insert into auth.identities values($1,'google',$2)", [ids[i], JSON.stringify({ email: i === 7 ? "other@example.invalid" : email, email_verified: i !== 6 })]);
    if (i !== 2) await db.query("insert into portal_google_invitations(email,display_name,job_title,role,store_id) values($1,'架空 スタッフ','社員',$2,$3)", [email, i === 0 ? "company" : "manager", i === 0 ? null : "honten"]);
  }
  await db.exec("insert into portal_sales_imports(id,source,as_of) values('fixture','架空のRLS検証','2026-10-02');insert into portal_sales_daily values('fixture','honten','2026-10-01',1500,1500,110),('fixture','816','2026-10-01',600,600,90)");
  await db.exec(readFileSync("supabase/migrations/202610280001_sheets_sync.sql", "utf8"));
  await db.exec("insert into portal_cash_months values('honten','2026-10-01',1000,now());insert into portal_cash_records(store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy) values('honten','fixture:1','2026-10-01',1,'売上','架空',100,0,1100)");

}, 30000);
afterAll(async () => { await db?.close(); });
describe("共有売上の認証・店舗別RLS", () => {
  it("未認証は売上・取込情報とも読めない", async () => {
    for (const table of ["portal_sales_imports","portal_sales_daily","portal_sales_records","portal_cash_records","portal_sync_runs","portal_sync_audit"]) {
      await db.exec("begin;set local role anon");
      try { await expect(db.query(`select * from ${table}`)).rejects.toThrow(); } finally { await db.exec("rollback"); }
    }
  });
  it("GoogleとOTPの全社管理者は両店舗、店舗管理者は所属店舗だけ読める", async () => {
    for (const method of ["otp","oauth"]) {
      await asUser(0, async () => { await db.query("select portal_accept_email_invitation()"); expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(2); }, "otp");
      await asUser(1, async () => {
        await db.query(method === "otp" ? "select portal_accept_email_invitation()" : "select portal_accept_google_invitation('架空スタッフ')");
        const {rows}=await db.query<{store_id:string}>("select store_id from portal_sales_daily");
        expect(rows.map(r=>r.store_id)).toEqual(["honten"]);
      }, method);
    }
  });
  it("所属店舗の変更を偽ったクエリでも他店は読めず、一般スタッフへ売上を渡さない", async () => {
    await asUser(1, async () => {
      await db.query("select portal_accept_email_invitation()");
      expect((await db.query("select * from portal_sales_daily where store_id='816'")).rows).toHaveLength(0);
      await db.exec("reset role;update portal_members set role='staff';set local role authenticated");
      expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(0);
      expect((await db.query("select * from portal_sales_imports")).rows).toHaveLength(0);
    }, "otp");
  });
  it("許可取り消し・停止・未登録は既存セッションでも売上を読めない", async () => {
    await asUser(0, async () => {
      await db.query("select portal_accept_email_invitation()");
      await db.exec("reset role;update portal_google_invitations set enabled=false;set local role authenticated");
      expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(0);
    }, "otp");
    await asUser(1, async () => {
      await db.query("select portal_accept_email_invitation()");
      await db.exec("reset role;update portal_members set status='disabled';set local role authenticated");
      expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(0);
    }, "otp");
    await asUser(2, async () => { expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(0); }, "otp");
  });
  it("全社管理者でも画面の認証キーから実績を書き換えたり削除したりできない", async () => {
    for (const query of ["delete from portal_sales_daily", "update portal_sales_daily set sales_jpy=0", "insert into portal_sales_imports(id,source,as_of) values('fake','架空','2026-10-02')"])
      await asUser(0, async () => { await db.query("select portal_accept_email_invitation()"); await expect(db.query(query)).rejects.toThrow(); }, "otp");
  });
});

describe("日次取込の重複防止とトランザクション",()=>{
  const sale=[{store_id:"honten",sales_date:"2026-10-02",sales_jpy:1600,labor_minutes:120}];
  const cash=[{store_id:"honten",source_key:"fixture:1",transaction_date:"2026-10-01",source_order:1,category:"売上",description:"架空",receipt_jpy:100,payment_jpy:0,balance_jpy:1100}];
  async function apply(id:string, s= sale,c=cash){await db.query("select portal_apply_sheets_sync($1,$2,$3,'2026-10-01',1000)",[id,JSON.stringify(s),JSON.stringify(c)]);}
  it("一日分のupsertで過去が消えず、再実行しても重複しない",async()=>{
    await apply("run-one"); await apply("run-one"); await apply("run-two");
    expect((await db.query("select * from portal_sales_records")).rows).toHaveLength(3);
    expect((await db.query("select * from portal_cash_records where active")).rows).toHaveLength(1);
    expect((await db.query("select * from portal_sync_audit")).rows).toHaveLength(2);
  });
  it("不正残高・重複・異常な訂正で全体をロールバックし、正常値を維持する",async()=>{
    await expect(apply("bad-balance",[{...sale[0],sales_jpy:1700}],[{...cash[0],balance_jpy:1101}])).rejects.toThrow();
    await expect(apply("bad-duplicate",[...sale,...sale])).rejects.toThrow();
    await expect(apply("bad-correction",[{...sale[0],sales_jpy:99999999}])).rejects.toThrow();
    expect((await db.query<{sales_jpy:number}>("select sales_jpy from portal_sales_records where sales_date='2026-10-02'")).rows[0].sales_jpy).toBe(1600);
  });
  it("OTP本人でも画面経由の書込RPC実行・監査原本取得は禁止",async()=>{
    await asUser(0,async()=>{
      await db.query("select portal_accept_email_invitation()");
      await expect(apply("forged")).rejects.toThrow();
      await expect(db.query("select * from portal_sync_audit")).rejects.toThrow();
    },"otp");
  });
  it("新しい売上・出納帳にも所属店・許可取り消しのRLSを適用",async()=>{
    await asUser(1,async()=>{
      await db.query("select portal_accept_email_invitation()");
      expect((await db.query("select * from portal_sales_records where store_id='816'")).rows).toHaveLength(0);
      expect((await db.query("select * from portal_cash_records")).rows).toHaveLength(1);
      await db.exec("reset role;update portal_google_invitations set enabled=false;set local role authenticated");
      expect((await db.query("select * from portal_cash_records")).rows).toHaveLength(0);
      expect((await db.query("select * from portal_sales_records")).rows).toHaveLength(0);
    },"otp");
  });
});
