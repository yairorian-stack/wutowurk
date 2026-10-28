// Runs only in the private GitHub Actions environment. Never logs source rows or credentials.
import { createSign, randomUUID } from "node:crypto";
import { loadTsModule } from "./load-ts-module.mjs";
const { parseSalesGrid, parseCashGrid } = await loadTsModule("src/lib/sheets-import.ts");
let supabase, serviceKey;
const runId = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : randomUUID();
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok) throw new Error("SYNC_FAILED");
  return response.status === 204 ? null : response.json();
}
async function rpc(name, payload) {
  const response = await fetch(`${supabase}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(30000), redirect: "error",
  });
  if (!response.ok) {
    let validation = false;
    try { validation = (await response.json()).message === "SOURCE_VALIDATION_FAILED"; } catch { /* No raw provider errors in logs. */ }
    throw new Error(validation ? "SOURCE_VALIDATION_FAILED" : "SYNC_FAILED");
  }
}
try {
  const config = JSON.parse(process.env.SHEETS_SYNC_CONFIG ?? "null");
  const account = JSON.parse(process.env.SHEETS_SERVICE_ACCOUNT_JSON ?? "null");
  if (!config || !account || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(account.client_email) || typeof account.private_key !== "string") throw new Error("SYNC_FAILED");
  for (const source of [config.sales, config.cash]) {
    if (!source || !/^[\w-]{20,100}$/.test(source.spreadsheetId) || typeof source.tab !== "string" || !/^[A-Z]+1:[A-Z]+\d+$/.test(source.range)) throw new Error("SYNC_FAILED");
  }
  // This release intentionally imports ONLY the verified Honten cash source/month.
  if (config.cash.store !== "honten" || !Number.isInteger(config.cash.year) || config.cash.year < 2026 || config.cash.year > 2100 || !Number.isInteger(config.cash.month) || config.cash.month < 1 || config.cash.month > 12 || config.sales.range !== "A1:AC400") throw new Error("SYNC_FAILED");
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) {
    supabase = process.env.SUPABASE_SYNC_URL;
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(supabase ?? "") || !serviceKey) throw new Error("SYNC_FAILED");
  }
  const now = Math.floor(Date.now()/1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now+3600 })}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key,"base64url")}`;
  const token = await jsonFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (typeof token?.access_token !== "string") throw new Error("SYNC_FAILED");
  const read = async source => {
    const range = `'${source.tab.replaceAll("'", "''")}'!${source.range}`;
    const result = await jsonFetch(`https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const grid = result.values;
    if (!Array.isArray(grid) || grid.length >= Number(source.range.match(/\d+$/)[0])) throw new Error("SOURCE_VALIDATION_FAILED");
    return grid;
  };
  const [salesGrid,cashGrid] = await Promise.all([read(config.sales),read(config.cash)]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  // Parse dates before filtering, so malformed/future populated rows are never silently published.
  const sales = parseSalesGrid(salesGrid,config.sales.blocks,today);
  const cash = parseCashGrid(cashGrid,{year:config.cash.year,month:config.cash.month,firstRow:1,source:`honten-${config.cash.year}-${String(config.cash.month).padStart(2,"0")}`,headerRows:config.cash.headerRows},today);
  if (dryRun) {
    console.log("Source validation succeeded. No database writes performed. Hanoura cash remains blocked.");
  } else {
    await rpc("portal_apply_sheets_sync", { p_run_id:runId,p_sales:sales,p_cash:cash.rows,p_cash_month:`${config.cash.year}-${String(config.cash.month).padStart(2,"0")}-01`,p_opening:cash.opening });
    console.log("Import committed. Hanoura cash remains blocked pending year confirmation.");
  }
} catch (error) {
  const code = error instanceof Error && error.message === "SOURCE_VALIDATION_FAILED" ? error.message : "SYNC_FAILED";
  if (supabase && serviceKey) {
    try { await rpc("portal_record_sync_failure",{p_run_id:runId,p_code:code}); } catch { /* GitHub failure notifications remain the fallback. */ }
  }
  console.error(`${code}: previous verified data retained. Review the private source and connection settings.`);
  process.exitCode = 1;
}
