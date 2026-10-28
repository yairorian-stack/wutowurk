import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const ids = Array.from(
  { length: 7 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`,
);
let db: PGlite;
async function asUser(
  index: number,
  fn: () => Promise<void>,
  role = "authenticated",
) {
  await db.exec(
    `begin;set local role ${role};select set_config('request.jwt.claim.sub','${ids[index]}',true);`,
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
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(
    readFileSync("supabase/migrations/202610250001_membership.sql", "utf8"),
  );
  for (let i = 0; i < ids.length; i++)
    await db.query("insert into auth.users values($1,$2,$3)", [
      ids[i],
      `staff${i}@example.invalid`,
      i === 6 ? null : "2026-10-25T00:00:00Z",
    ]);
  const roles = ["system", "company", "manager", "staff", "staff", "manager"];
  for (let i = 0; i < roles.length; i++)
    await db.query(
      "insert into public.portal_members(user_id,email,display_name,job_title,role,store_id,status) values($1,$2,$3,'社員',$4,$5,$6)",
      [
        ids[i],
        `staff${i}@example.invalid`,
        `架空スタッフ${i}`,
        roles[i],
        i < 2 || i === 4 ? null : i === 5 ? "816" : "honten",
        i === 4 ? "pending" : "approved",
      ],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("PostgreSQLによる本人・店舗・管理権限の検証", () => {
  it("一般スタッフ・店舗管理者・承認待ちは自分の登録しか読めない", async () => {
    for (const i of [2, 3, 4, 5])
      await asUser(i, async () => {
        const { rows } = await db.query<{ user_id: string }>(
          "select user_id from portal_members",
        );
        expect(rows.map((r) => r.user_id)).toEqual([ids[i]]);
      });
  });
  it("未ログインはメンバーと監査履歴を読めない", async () => {
    await asUser(
      3,
      async () => {
        await expect(
          db.query("select * from portal_members"),
        ).rejects.toThrow();
      },
      "anon",
    );
  });
  it("全社管理者だけがスタッフ一覧を閲覧できる", async () => {
    await asUser(1, async () => {
      expect(
        (await db.query("select * from portal_members")).rows,
      ).toHaveLength(6);
    });
  });
  it("一般スタッフは直接更新やRPCで自分を昇格できない", async () => {
    await asUser(3, async () => {
      await expect(
        db.query("update portal_members set role='company'"),
      ).rejects.toThrow();
    });
    await asUser(3, async () => {
      await expect(
        db.query(
          "select portal_manage_member($1,'総合責任者','company',null,'approved')",
          [ids[3]],
        ),
      ).rejects.toThrow();
    });
  });
  it("申請は本人確認済みメールから作られ、必ず承認待ちの一般権限になる", async () => {
    await asUser(4, async () => {
      const { rows } = await db.query<{
        p: { role: string; status: string; email: string };
      }>("select portal_request_access('別の役職名を名乗るスタッフ') p");
      expect(rows[0].p).toMatchObject({
        role: "staff",
        status: "pending",
        email: "staff4@example.invalid",
      });
    });
    await asUser(6, async () => {
      await expect(
        db.query("select portal_request_access('未確認スタッフ')"),
      ).rejects.toThrow();
    });
  });
  it("全社管理者は社員を店舗指定で承認でき、履歴が残る", async () => {
    await asUser(1, async () => {
      await db.query(
        "select portal_manage_member($1,'社員','staff','816','approved')",
        [ids[4]],
      );
      const { rows } = await db.query<{ store_id: string; status: string }>(
        "select store_id,status from portal_members where user_id=$1",
        [ids[4]],
      );
      expect(rows[0]).toMatchObject({ store_id: "816", status: "approved" });
      expect(
        (await db.query("select * from portal_member_audit")).rows,
      ).toHaveLength(1);
    });
  });
  it("全社管理者は高位権限を付与できず、店長は他店舗を含むメンバーを変更できない", async () => {
    await asUser(1, async () => {
      await expect(
        db.query(
          "select portal_manage_member($1,'総合責任者','system',null,'approved')",
          [ids[4]],
        ),
      ).rejects.toThrow();
    });
    await asUser(2, async () => {
      await expect(
        db.query(
          "select portal_manage_member($1,'社員','staff','816','approved')",
          [ids[5]],
        ),
      ).rejects.toThrow();
    });
  });
  it("所属店舗のない承認や、最後の管理者の停止を拒否する", async () => {
    await asUser(1, async () => {
      await expect(
        db.query(
          "select portal_manage_member($1,'社員','staff',null,'approved')",
          [ids[4]],
        ),
      ).rejects.toThrow();
    });
    await db.exec("begin");
    try {
      await db.query(
        "update portal_members set status='disabled' where user_id=$1",
        [ids[1]],
      );
      await db.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${ids[0]}',true)`,
      );
      await expect(
        db.query(
          "select portal_manage_member($1,'総合責任者','system',null,'disabled')",
          [ids[0]],
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("rollback");
    }
  });
});
