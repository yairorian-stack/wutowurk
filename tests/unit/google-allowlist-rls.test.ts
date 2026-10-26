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
  for (const file of ["202610250001_membership.sql", "202610260001_google_allowlist.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (let i = 0; i < ids.length; i++) {
    const email = `pilot${i}@example.invalid`;
    await db.query("insert into auth.users values($1,$2,$3)", [ids[i], email, i === 5 ? null : "2026-10-26T00:00:00Z"]);
    await db.query("insert into auth.identities values($1,'google',$2)", [ids[i], JSON.stringify({ email: i === 7 ? "other@example.invalid" : email, email_verified: i !== 6 })]);
    if (i !== 2) await db.query("insert into portal_google_invitations(email,display_name,job_title,role,store_id) values($1,'架空 スタッフ','社員',$2,$3)", [email, i === 0 ? "company" : "manager", i === 0 ? null : "honten"]);
  }
}, 30000);
afterAll(async () => { await db?.close(); });
describe("Google許可リストとPostgreSQLの実権限", () => {
  it("本人確認済みの登録Googleアカウントだけが指定済みの役職・店舗で参加できる", async () => {
    await asUser(1, async () => {
      const { rows } = await db.query<{ m: { role: string; store_id: string; status: string } }>("select portal_accept_google_invitation('架空スタッフ') m");
      expect(rows[0].m).toMatchObject({ role: "manager", store_id: "honten", status: "approved" });
      expect((await db.query("select * from portal_members")).rows).toHaveLength(1);
      expect((await db.query("select * from portal_member_audit")).rows).toHaveLength(0);
    });
  });
  it("最初にログインした一般利用者を管理者にしない。管理者は所有者が事前指定した人だけ", async () => {
    await asUser(0, async () => {
      const { rows } = await db.query<{ m: { role: string } }>("select portal_accept_google_invitation('架空スタッフ') m");
      expect(rows[0].m.role).toBe("company");
      expect((await db.query("select * from portal_member_audit")).rows).toHaveLength(1);
    });
  });
  it("未登録・メール未確認・Googleのメール未確認・Googleと登録メール不一致を拒否", async () => {
    for (const index of [2, 5, 6, 7]) await asUser(index, async () => {
      expect((await db.query<{ ok: boolean }>("select portal_google_allowed() ok")).rows[0].ok).toBe(false);
      await expect(db.query("select portal_accept_google_invitation('架空スタッフ')")).rejects.toThrow();
    });
  });
  it("Google連携済みアカウントでもOTPや他社OAuthでのログインを拒否", async () => {
    for (const [method, provider] of [["otp", "google"], ["oauth", "github"]])
      await asUser(1, async () => {
        expect((await db.query<{ ok: boolean }>("select portal_google_allowed() ok")).rows[0].ok).toBe(false);
        await expect(db.query("select portal_accept_google_invitation('架空スタッフ')")).rejects.toThrow();
      }, method, provider);
  });
  it("初回provider情報がGoogleでも、他社identityが連携された曖昧なOAuthセッションを拒否", async () => {
    await asUser(1, async () => {
      await db.exec("reset role");
      await db.query("insert into auth.identities values($1,'github','{}')", [ids[1]]);
      await db.exec("set local role authenticated");
      expect((await db.query<{ ok: boolean }>("select portal_google_allowed() ok")).rows[0].ok).toBe(false);
      await expect(db.query("select portal_accept_google_invitation('架空スタッフ')")).rejects.toThrow();
    });
  });
  it("許可リストの直接閲覧・変更・旧OTP用の登録RPCを拒否", async () => {
    for (const query of ["select * from portal_google_invitations", "update portal_google_invitations set role='system'", "select portal_request_access('架空スタッフ')"])
      await asUser(1, async () => { await expect(db.query(query)).rejects.toThrow(); });
    await db.exec("begin;set local role anon");
    try { await expect(db.query("select portal_google_allowed()")).rejects.toThrow(); } finally { await db.exec("rollback"); }
  });
  it("氏名の詐称と店舗未指定の招待を拒否", async () => {
    await asUser(1, async () => { await expect(db.query("select portal_accept_google_invitation('他の氏名')")).rejects.toThrow(); });
    await expect(db.query("insert into portal_google_invitations(email,display_name,job_title,role) values('invalid@example.invalid','架空','社員','staff')")).rejects.toThrow();
  });
  it("許可取り消しで既存セッションの本人情報と管理権限も直ちに閉じる", async () => {
    await asUser(0, async () => {
      await db.query("select portal_accept_google_invitation('架空スタッフ')");
      await db.exec("reset role;update portal_google_invitations set enabled=false where email='pilot0@example.invalid';set local role authenticated");
      expect((await db.query("select * from portal_members")).rows).toHaveLength(0);
      expect((await db.query<{ ok: boolean }>("select portal_is_admin() ok")).rows[0].ok).toBe(false);
    });
  });
  it("一度停止したメンバーをGoogleログインで再承認しない", async () => {
    await asUser(1, async () => {
      await db.query("select portal_accept_google_invitation('架空スタッフ')");
      await db.exec("reset role;update portal_members set status='disabled';set local role authenticated");
      await expect(db.query("select portal_accept_google_invitation('架空スタッフ')")).rejects.toThrow();
    });
  });
  it("管理者が変更した役職・店舗を次のログインで招待時の値に戻さない", async () => {
    await asUser(1, async () => {
      await db.query("select portal_accept_google_invitation('架空スタッフ')");
      await db.exec("reset role;update portal_members set role='staff',store_id='816';set local role authenticated");
      const { rows } = await db.query<{ m: { role: string; store_id: string } }>("select portal_accept_google_invitation('架空スタッフ') m");
      expect(rows[0].m).toMatchObject({ role: "staff", store_id: "816" });
    });
  });
  it("許可取り消し済みの別管理者を人数に含めず、最後の有効管理者を保護", async () => {
    await asUser(0, async () => {
      await db.query("select portal_accept_google_invitation('架空スタッフ')");
      await db.exec("reset role");
      await db.query("update portal_members set role='system' where user_id=$1", [ids[0]]);
      await db.query("insert into portal_members(user_id,email,display_name,job_title,role,status) values($1,'pilot3@example.invalid','架空','総合責任者','company','approved')", [ids[3]]);
      await db.exec("update portal_google_invitations set enabled=false where email='pilot3@example.invalid';set local role authenticated");
      await expect(db.query("select portal_manage_member($1,'社員','staff','honten','approved')", [ids[0]])).rejects.toThrow("last administrator");
    });
  });
});
