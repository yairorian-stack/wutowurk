import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { canEdit,canRead } from "../../src/lib/domain";
let db:PGlite;
const admin="50000000-0000-4000-8000-000000000001", reader="50000000-0000-4000-8000-000000000002", fresh="50000000-0000-4000-8000-000000000003";
const ledger=[
  {email:"admin@example.invalid",display_name:"架空 管理者",job_title:"総合責任者",role:"company",store_id:null,enabled:true,read_all_stores:true},
  {email:"reader@example.invalid",display_name:"架空 両店",job_title:"社員",role:"staff",store_id:"honten",enabled:true,read_all_stores:true},
  {email:"new@example.invalid",display_name:"架空 新人",job_title:"社員",role:"staff",store_id:"816",enabled:true,read_all_stores:false},
];
async function rollback(fn:()=>Promise<void>){await db.exec("begin");try{await fn();}finally{await db.exec("rollback");}}
async function asReader(){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[reader,JSON.stringify({amr:[{method:"otp"}]})]);await db.exec("set local role authenticated");}
async function sync(id:string,rows=ledger){await db.query("select portal_apply_staff_access_sync($1,$2)",[id,JSON.stringify(rows)]);}
beforeAll(async()=>{
  db=new PGlite();await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create schema extensions;
    -- Stub crypto/HTTP only; production uses pgcrypto SHA-256 and pg_net. No test email is sent.
    create function extensions.digest(text,text) returns bytea language sql as $$select convert_to(md5($1),'UTF8')$$;
    create schema net;
    create table net.test_queue(id bigserial primary key,url text,body jsonb,headers jsonb);
    create function net.http_post(url text,body jsonb,params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 2000) returns bigint language sql as
      $$insert into net.test_queue(url,body,headers) values(url,body,headers) returning id$$;`);
  for(const file of ["202610250001_membership.sql","202610260001_google_allowlist.sql","202610260002_email_otp.sql","202610260003_shared_sales.sql","202610280005_staff_access_sync.sql","202610290001_staff_scope.sql","202610290002_staff_otp_dispatch.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8").replace("create extension if not exists pg_net with schema extensions;",""));
  await db.query("insert into auth.users values($1,'admin@example.invalid',now()),($2,'reader@example.invalid',now())",[admin,reader]);
  await db.exec(`insert into portal_google_invitations(email,display_name,job_title,role) values('admin@example.invalid','架空 管理者','総合責任者','company');
    insert into portal_members(user_id,email,display_name,job_title,role,status) values('${admin}','admin@example.invalid','架空 管理者','総合責任者','company','approved');
    insert into portal_staff_otp_config values(true,'https://abcdefghijklmnopqrst.supabase.co','sb_publishable_test');
    insert into portal_sales_imports(id,source,as_of) values('scope-test','架空','2026-10-01');
    insert into portal_sales_daily values('scope-test','honten','2026-10-01',1000,1000,100),('scope-test','816','2026-10-01',2000,2000,100);`);
  await sync("initial");
  await db.query("insert into portal_members(user_id,email,display_name,job_title,role,store_id,status) values($1,'reader@example.invalid','架空 両店','社員','staff','honten','approved')",[reader]);
},30000);
afterAll(async()=>{await db?.close();});
describe("台帳による自動ログインと閲覧範囲",()=>{
  it("初回プロフィールも両店舗のRLS閲覧を許可し管理・編集権限を増やさない",async()=>rollback(async()=>{
    await asReader();
    expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(2);
    expect((await db.query<{ok:boolean}>("select portal_is_admin() ok")).rows[0].ok).toBe(false);
    await expect(db.exec("update portal_members set role='system'")).rejects.toThrow();
    const session={role:"staff" as const,storeId:"honten" as const,readAllStores:true};
    expect(canRead(session,"816")).toBe(true);expect(canEdit(session,"816")).toBe(false);expect(canEdit(session,"honten")).toBe(false);
  }));
  it("同期待ちの新人のAuthアカウントがなくても有効な台帳行は送信対象になる",async()=>rollback(async()=>{
    expect((await db.query("select * from auth.users where email='new@example.invalid'")).rows).toHaveLength(0);
    await db.exec("set local role anon;select portal_request_staff_otp('new@example.invalid');reset role");
    const q=await db.query<{url:string;body:{email:string;create_user:boolean}}>("select url,body from net.test_queue");
    expect(q.rows).toEqual([{url:"https://abcdefghijklmnopqrst.supabase.co/auth/v1/otp",body:{email:"new@example.invalid",create_user:true}}]);
  }));
  it("登録外・無効・停止メンバー・不正なメールには送らず同じvoidを返す",async()=>rollback(async()=>{
    await db.exec("update portal_google_invitations set enabled=false where email='new@example.invalid';update portal_members set status='disabled' where email='reader@example.invalid';set local role anon");
    for(const email of ["outsider@example.invalid","new@example.invalid","reader@example.invalid","BAD"," Reader@example.invalid "])
      await db.query("select portal_request_staff_otp($1)",[email]);
    await db.exec("reset role");expect((await db.query("select * from net.test_queue")).rows).toHaveLength(0);
  }));
  it("再送60秒・毎時5回をDBで制限し、公開RPCから対象一覧を読めない",async()=>rollback(async()=>{
    for(let i=0;i<6;i++){
      await db.exec("set local role anon;select portal_request_staff_otp('new@example.invalid');reset role");
      await db.exec("update portal_staff_otp_dispatch set requested_at=requested_at-interval '61 seconds'");
    }
    expect((await db.query("select * from net.test_queue")).rows).toHaveLength(5);
    await db.exec("set local role anon");
    await expect(db.exec("select * from portal_staff_otp_dispatch")).rejects.toThrow();
  }));
  it("削除・無効・閲覧範囲の縮小を既存セッションにも適用する",async()=>rollback(async()=>{
    await sync("narrow",ledger.map(r=>({...r,read_all_stores:false})));
    await asReader();expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(1);
    await db.exec("reset role");await sync("remove",ledger.filter(r=>r.email!=="reader@example.invalid"));
    await asReader();expect((await db.query("select * from portal_sales_daily")).rows).toHaveLength(0);
    await db.exec("reset role");
    expect((await db.query<{status:string}>("select status from portal_members where user_id=$1",[reader])).rows[0].status).toBe("disabled");
  }));
  it("未確認メールでは入れず、最後の管理者の削除は同期全体を拒否する",async()=>rollback(async()=>{
    await db.query("insert into auth.users values($1,'new@example.invalid',null)",[fresh]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[fresh,JSON.stringify({amr:[{method:"otp"}]})]);
    await db.exec("set local role authenticated");await expect(db.exec("select portal_accept_email_invitation()")).rejects.toThrow();
  }));
  it("最後の管理者を削除するスナップショットを拒否する",async()=>rollback(async()=>{
    await expect(sync("no-admin",ledger.slice(1))).rejects.toThrow("SOURCE_VALIDATION_FAILED");
  }));
});
