import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;
const adminId = "40000000-0000-4000-8000-000000000001";
const staffId = "40000000-0000-4000-8000-000000000002";

async function asUser(id: string, fn: () => Promise<void>) {
  await db.exec("begin; set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
    [id, JSON.stringify({ amr: [{ method: "otp" }] })],
  );
  try {
    await fn();
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  for (const file of [
    "202610250001_membership.sql",
    "202610260001_google_allowlist.sql",
    "202610260002_email_otp.sql",
    "202610260003_shared_sales.sql",
    "202610280005_staff_access_sync.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1,'admin@example.invalid',now())", [
    adminId,
  ]);
  await db.query("insert into auth.users values($1,'staff@example.invalid',now())", [
    staffId,
  ]);
  await db.exec(`
    insert into portal_google_invitations(email,display_name,job_title,role,store_id)
      values('admin@example.invalid','架空 管理者','総合責任者','company',null),
            ('staff@example.invalid','架空 スタッフ','社員','manager','honten');
    insert into portal_members(user_id,email,display_name,job_title,role,store_id,status)
      values('${adminId}','admin@example.invalid','架空 管理者','総合責任者','company',null,'approved'),
            ('${staffId}','staff@example.invalid','架空 スタッフ','社員','manager','honten','approved');
    insert into portal_sales_imports(id,source,as_of) values('staff-test','架空','2026-10-01');
    insert into portal_sales_daily values
      ('staff-test','honten','2026-10-01',1000,1000,100),
      ('staff-test','816','2026-10-01',2000,2000,100);
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

const ledger = [
  {
    email: "admin@example.invalid",
    display_name: "架空 管理者",
    job_title: "総合責任者",
    role: "company",
    store_id: null,
    enabled: true,
  },
  {
    email: "staff@example.invalid",
    display_name: "架空 本店スタッフ",
    job_title: "社員",
    role: "staff",
    store_id: "honten",
    enabled: true,
  },
];

describe("スタッフ権限台帳のDB同期", () => {
  it("service_roleだけが検証済み台帳を反映し監査を残す", async () => {
    await db.exec("begin; set local role service_role");
    const result = await db.query<{ result: { updated: number } }>(
      "select portal_apply_staff_access_sync('staff-run-1',$1) result",
      [JSON.stringify(ledger)],
    );
    await db.exec("commit");
    expect(result.rows[0].result.updated).toBe(1);
    const member = await db.query<{ role: string; store_id: string }>(
      "select role,store_id from portal_members where user_id=$1",
      [staffId],
    );
    expect(member.rows[0]).toMatchObject({ role: "staff", store_id: "honten" });
    expect(
      (await db.query("select * from portal_member_audit where operation='staff_sheet_sync'"))
        .rows,
    ).toHaveLength(1);
  });

  it("一般スタッフは自店舗だけをRLS経由で閲覧する", async () => {
    await asUser(staffId, async () => {
      const rows = await db.query<{ store_id: string }>(
        "select store_id from portal_sales_daily order by store_id",
      );
      expect(rows.rows.map((row) => row.store_id)).toEqual(["honten"]);
    });
  });

  it("最後の承認済み管理者を無効にする同期を全件拒否する", async () => {
    const unsafe = [
      { ...ledger[0], enabled: false },
      {
        email: "future-admin@example.invalid",
        display_name: "架空 次期管理者",
        job_title: "総合責任者",
        role: "company",
        store_id: null,
        enabled: true,
      },
    ];
    await db.exec("begin; set local role service_role");
    try {
      await expect(
        db.query("select portal_apply_staff_access_sync('staff-run-unsafe',$1)", [
          JSON.stringify(unsafe),
        ]),
      ).rejects.toThrow("SOURCE_VALIDATION_FAILED");
    } finally {
      await db.exec("rollback");
    }
    expect(
      (
        await db.query<{ enabled: boolean }>(
          "select enabled from portal_google_invitations where email='admin@example.invalid'",
        )
      ).rows[0].enabled,
    ).toBe(true);
  });

  it("公開クライアントからRPCを直接実行できない", async () => {
    await db.exec("begin; set local role authenticated");
    try {
      await expect(
        db.query("select portal_apply_staff_access_sync('forged',$1)", [
          JSON.stringify(ledger),
        ]),
      ).rejects.toThrow();
    } finally {
      await db.exec("rollback");
    }
  });
});
