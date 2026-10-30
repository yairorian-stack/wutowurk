// Integration fixture: no real Google, database or cashbook requests.
import { writeFileSync } from "node:fs";
import { loadTsModule } from "../../scripts/load-ts-module.mjs";
const { fiscalFixture } = await loadTsModule("tests/fixtures/fiscal-sales.ts");
const fixture = fiscalFixture({ "2026-08-01": { honten: 100, hanoura: 200, hontenHours: 1, hanouraHours: 2 } });
fixture.effective[2][3] = 1.25;
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  requests.push({ url, body: url.includes("/rpc/") ? JSON.parse(init.body) : null });
  writeFileSync(process.env.SALES_SYNC_TEST_REPORT, JSON.stringify(requests));
  if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fixture" });
  if (url.includes("spreadsheets/12345678901234567890")) {
    if (url.includes("includeGridData=true")) return Response.json({ sheets: [{ properties: { sheetId: 1 }, data: [{ startRow: 0, startColumn: 11,
      rowData: fixture.effective.map((row, i) => ({ values: row.map((value, j) => ({ formattedValue: fixture.formatted[i][j], effectiveValue: value == null ? undefined : typeof value === "number" ? { numberValue: value } : { stringValue: value } })) })),
    }] }] });
    return Response.json({ sheets: [{ properties: { sheetId: 1, title: "2店舗合計 日間売上と人時売上", gridProperties: { rowCount: 1000, columnCount: 57 } } }] });
  }
  if (url.endsWith("/rpc/portal_apply_sales_sync")) return new Response(null, { status: 204 });
  throw new Error("Unexpected endpoint: sales-only must never access cashbooks or staff");
};
