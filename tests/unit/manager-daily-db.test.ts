import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;
const managerId = "30000000-0000-4000-8000-000000000001";

async function asManager(fn: () => Promise<void>) {
  await db.exec("begin; set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    managerId,
  ]);
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      amr: [{ method: "otp" }],
      app_metadata: { provider: "email" },
    }),
  ]);
  try {
    await fn();
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated, anon;
    create table auth.users(
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    );
    create table auth.identities(user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  `);
  for (const file of [
    "202610250001_membership.sql",
    "202610260001_google_allowlist.sql",
    "202610260002_email_otp.sql",
    "202610260003_shared_sales.sql",
    "202610280003_manager_daily.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1,$2,now())", [
    managerId,
    "manager@example.invalid",
  ]);
  await db.exec(
    "insert into portal_google_invitations(email,display_name,job_title,role,store_id) values('manager@example.invalid','架空 店長','店長業務','manager','honten')",
  );
  await db.query(
    "insert into portal_members(user_id,email,display_name,job_title,role,store_id,status) values($1,$2,'架空 店長','店長業務','manager','honten','approved')",
    [managerId, "manager@example.invalid"],
  );
  await db.exec("begin; set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [managerId]);
  await db.query(
    "select portal_submit_manager_daily('honten','2026-10-27',4000,3000,2000,1000,0,720,0,0,'旧日報','[]'::jsonb)",
  );
  await db.exec("commit");
  await db.exec(
    readFileSync(
      "supabase/migrations/202610280004_manager_daily_tender_labels.sql",
      "utf8",
    ),
  );
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe("店長日報の決済名目マイグレーション", () => {
  it("既存日報を空の名目で維持する", async () => {
    const result = await db.query<{ cash_sales_label: string }>(
      "select cash_sales_label from portal_manager_daily_reports where store_id='honten' and report_date='2026-10-27'",
    );
    expect(result.rows[0].cash_sales_label).toBe("");
  });

  it("名目付き訂正を保存して監査履歴を残す", async () => {
    await asManager(async () => {
      await db.query(
        "select portal_submit_manager_daily_v2('honten','2026-10-27',4000,'店頭現金',3000,'VISA・JCB',2000,'PayPay',1000,'徳島県食事券',0,'',720,2,500,'訂正版','[]'::jsonb)",
      );
      const report = await db.query<{
        credit_sales_label: string;
        qr_sales_label: string;
        revision: number;
      }>(
        "select credit_sales_label,qr_sales_label,revision from portal_manager_daily_reports where store_id='honten' and report_date='2026-10-27'",
      );
      expect(report.rows[0]).toMatchObject({
        credit_sales_label: "VISA・JCB",
        qr_sales_label: "PayPay",
        revision: 2,
      });
      expect(
        (
          await db.query(
            "select * from portal_manager_daily_audit where store_id='honten' and report_date='2026-10-27'",
          )
        ).rows,
      ).toHaveLength(2);
    });
  });

  it("本店店長による羽ノ浦店の更新を拒否する", async () => {
    await asManager(async () => {
      await expect(
        db.query(
          "select portal_submit_manager_daily_v2('816','2026-10-27',1,'',0,'',0,'',0,'',0,'',60,0,0,'','[]'::jsonb)",
        ),
      ).rejects.toThrow("manager access required");
    });
  });
});
