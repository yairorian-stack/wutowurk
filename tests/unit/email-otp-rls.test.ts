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
  await db.exec(`create role anon;create role authenticated;create schema auth;
    grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  for (const file of ["202610250001_membership.sql", "202610260001_google_allowlist.sql", "202610260002_email_otp.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (let i = 0; i < ids.length; i++) {
    const email = `pilot${i}@example.invalid`;
    await db.query("insert into auth.users values($1,$2,$3)", [ids[i], email, i === 5 ? null : "2026-10-26T00:00:00Z"]);
    await db.query("insert into auth.identities values($1,'google',$2)", [ids[i], JSON.stringify({ email: i === 7 ? "other@example.invalid" : email, email_verified: i !== 6 })]);
    if (i !== 2) await db.query("insert into portal_google_invitations(email,display_name,job_title,role,store_id) values($1,'架空 スタッフ','社員',$2,$3)", [email, i === 0 ? "company" : "manager", i === 0 ? null : "honten"]);
  }
}, 30000);
afterAll(async () => { await db?.close(); });
describe("Google予備経路を保ちながらメールOTPを追加するDB権限", () => {
  it("メールidentityが追加されても予備のGoogle経路は維持する", async () => {
    await asUser(0, async () => {
      await db.exec("reset role");
      await db.query("insert into auth.identities values($1,'email','{}')", [ids[0]]);
      await db.exec("set local role authenticated");
      expect((await db.query<{ ok: boolean }>("select portal_google_allowed() ok")).rows[0].ok).toBe(true);
      await db.query("select portal_accept_google_invitation('架空スタッフ')");
    });
  });
  it("GoogleとメールOTPだけを許可し、未登録・未確認・単なるメール入力やパスワードでは通さない", async () => {
    for (const [index, method, expected] of [[0,"oauth",true],[1,"otp",true],[2,"otp",false],[5,"otp",false],[1,"password",false],[1,"",false]] as const)
      await asUser(index, async () => {
        expect((await db.query<{ ok: boolean }>("select portal_access_allowed() ok")).rows[0].ok).toBe(expected);
      }, method);
  });
  it("OTP本人確認後だけ登録済み氏名・役職・店舗を採用する。クライアントによる役職指定はない", async () => {
    await asUser(1, async () => {
      const { rows } = await db.query<{ m: { role: string; store_id: string; display_name: string } }>("select portal_accept_email_invitation() m");
      expect(rows[0].m).toMatchObject({ role: "manager", store_id: "honten", display_name: "架空 スタッフ" });
      expect((await db.query("select * from portal_members")).rows).toHaveLength(1);
    }, "otp");
    await asUser(1, async () => { await expect(db.query("select portal_accept_email_invitation()")).rejects.toThrow(); });
  });
  it("予備Googleの登録関数はOTPで呼べず、旧登録RPCも再開しない", async () => {
    await asUser(1, async () => { await expect(db.query("select portal_accept_google_invitation('架空スタッフ')")).rejects.toThrow(); }, "otp");
    await asUser(1, async () => { await expect(db.query("select portal_request_access('架空スタッフ')")).rejects.toThrow(); }, "otp");
  });
  it("OTPでも許可一覧を読めず、自己昇格や未登録者の登録を拒否する", async () => {
    await asUser(1, async () => { await expect(db.query("select * from portal_google_invitations")).rejects.toThrow(); }, "otp");
    await asUser(1, async () => {
      await db.query("select portal_accept_email_invitation()");
      await expect(db.query("update portal_members set role='system'")).rejects.toThrow();
    }, "otp");
    await asUser(2, async () => { await expect(db.query("select portal_accept_email_invitation()")).rejects.toThrow(); }, "otp");
  });
  it("OTP管理者にも既存の管理権限と監査を適用する", async () => {
    await asUser(0, async () => {
      await db.query("select portal_accept_email_invitation()");
      expect((await db.query<{ ok: boolean }>("select portal_is_admin() ok")).rows[0].ok).toBe(true);
      expect((await db.query("select * from portal_member_audit")).rows).toHaveLength(1);
    }, "otp");
  });
  it("停止と許可取り消しをOTPの再ログインでも迂回できない", async () => {
    await asUser(1, async () => {
      await db.query("select portal_accept_email_invitation()");
      await db.exec("reset role;update portal_members set status='disabled';set local role authenticated");
      await expect(db.query("select portal_accept_email_invitation()")).rejects.toThrow();
    }, "otp");
    await asUser(0, async () => {
      await db.query("select portal_accept_email_invitation()");
      await db.exec("reset role;update portal_google_invitations set enabled=false;set local role authenticated");
      expect((await db.query("select * from portal_members")).rows).toHaveLength(0);
      expect((await db.query<{ ok: boolean }>("select portal_is_admin() ok")).rows[0].ok).toBe(false);
    }, "otp");
  });
  it("公開の準備確認はtrueだけで、個人情報や許可リストは公開しない", async () => {
    await db.exec("begin;set local role anon");
    try {
      expect((await db.query<{ ready: boolean }>("select portal_email_otp_ready() ready")).rows[0].ready).toBe(true);
      await expect(db.query("select * from portal_google_invitations")).rejects.toThrow();
    } finally { await db.exec("rollback"); }
  });
});
