import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
describe("売上と前年比のみを更新する取込", () => {
  for (const dry of [true, false]) it(`${dry ? "検証" : "反映"}で出納帳・スタッフの取得と書込を行わない`, () => {
    const dir = mkdtempSync(join(tmpdir(), "sales-sync-test-")), report = join(dir, "report.json");
    try {
      const child = spawnSync(process.execPath, ["--import", "./tests/fixtures/sales-sync-fetch.mjs", "scripts/sync-google-sheets.mjs", "--sales-only", ...(dry ? ["--dry-run"] : [])], {
        encoding: "utf8", env: { ...process.env, SALES_SYNC_TEST_REPORT: report,
          SHEETS_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "test@fixture.iam.gserviceaccount.com", private_key: privateKey.export({ format: "pem", type: "pkcs8" }) }),
          SHEETS_SYNC_CONFIG: JSON.stringify({ sales: { spreadsheetId: "12345678901234567890", sheetId: 1, tab: "2店舗合計 日間売上と人時売上", range: "L1:V400", format: "fiscal-year-vertical", fiscalYearStart: 2026, firstDataRow: 3, lastDataRow: 368 }, cashSources: [{ spreadsheetId: "99999999999999999999", tab: "Do not read", range: "A1:H100", store: "honten", year: 2026, month: 10, enabled: false, sourceId: "fixture" }] }),
          SUPABASE_SYNC_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture", GITHUB_RUN_ID: "sales-fixture",
        },
      });
      expect(child.status, child.stderr).toBe(0);
      const requests = JSON.parse(readFileSync(report, "utf8")) as { url: string; body?: { p_sales: { reported_yoy: number }[] } }[];
      expect(requests.some((r) => r.url.includes("99999999999999999999"))).toBe(false);
      const writes = requests.filter((r) => r.url.includes("/rpc/"));
      expect(writes).toHaveLength(dry ? 0 : 1);
      if (!dry) {
        expect(writes[0].url).toContain("/portal_apply_sales_sync");
        expect(writes[0].body?.p_sales[0].reported_yoy).toBe(125);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
