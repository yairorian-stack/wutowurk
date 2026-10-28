// Runs only in the private GitHub Actions environment. Never logs source rows or credentials.
import { createSign, randomUUID } from "node:crypto";
import { loadTsModule } from "./load-ts-module.mjs";
const { parseSalesGrid, parseCashGrid, crossCheckCashSales } = await loadTsModule("src/lib/sheets-import.ts");
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
  return response.status === 204 ? null : response.json();
}
try {
  const config = JSON.parse(process.env.SHEETS_SYNC_CONFIG ?? "null");
  const account = JSON.parse(process.env.SHEETS_SERVICE_ACCOUNT_JSON ?? "null");
  if (!config || !account || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(account.client_email) || typeof account.private_key !== "string") throw new Error("SYNC_FAILED");
  if (!Array.isArray(config.cashSources) || !config.cashSources.length || config.cashSources.length>24) throw new Error("SYNC_FAILED");
  for (const source of [config.sales,...config.cashSources]) {
    if (!source || !/^[\w-]{20,100}$/.test(source.spreadsheetId) || typeof source.tab !== "string" || !/^[A-Z]+1:[A-Z]+\d+$/.test(source.range)) throw new Error("SYNC_FAILED");
  }
  const months = new Set();
  for (const source of config.cashSources) {
    if (!["honten","816"].includes(source.store) || !Number.isInteger(source.year) || source.year<2026 || source.year>2100 || !Number.isInteger(source.month) || source.month<1 || source.month>12 || typeof source.enabled!=="boolean" || !/^[a-zA-Z0-9:_-]{1,160}$/.test(source.sourceId)) throw new Error("SYNC_FAILED");
    const key=`${source.store}/${source.year}/${source.month}`;
    if (months.has(key)) throw new Error("SYNC_FAILED"); months.add(key);
    if (source.store==="816" && source.enabled && (source.year!==2026 || source.month!==10 || source.range!=="AD1:AK2000" || source.tab!=="39期目816　出納帳" || !Number.isInteger(source.sheetId) || JSON.stringify(source.yearCell)!=="[3,0]" || JSON.stringify(source.monthCell)!=="[5,0]" || source.labelsRow!==4 || source.headerRows!==4 || source.openingValueRow!==6 || source.firstTransactionDate!=="2026-10-01")) throw new Error("SYNC_FAILED");
  }
  if (config.sales.range!=="A1:AC400") throw new Error("SYNC_FAILED");
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
    const headers={Authorization:`Bearer ${token.access_token}`};
    const metadata=await jsonFetch(`https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties))`,{headers});
    const sheet=metadata.sheets?.find(s=>s.properties?.title===source.tab)?.properties;
    if (!sheet || !Number.isInteger(sheet.gridProperties?.rowCount) || sheet.gridProperties.rowCount<1 || (source.sheetId!==undefined && sheet.sheetId!==source.sheetId)) throw new Error("SOURCE_VALIDATION_FAILED");
    const requested=Number(source.range.match(/\d+$/)[0]);
    const bound=Math.min(requested,sheet.gridProperties.rowCount);
    const boundedRange=source.range.replace(/\d+$/,String(bound));
    const range = `'${source.tab.replaceAll("'", "''")}'!${boundedRange}`;
    const result = await jsonFetch(`https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,{headers});
    const grid=result.values;
    if (!Array.isArray(grid) || grid.length>=bound) throw new Error("SOURCE_VALIDATION_FAILED");
    return grid;
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const sales=parseSalesGrid(await read(config.sales),config.sales.blocks,today);
  if (!dryRun) await rpc("portal_apply_sales_sync",{p_run_id:runId,p_sales:sales});
  let failed=false, pending=false;
  for (const source of config.cashSources) {
    if (!source.enabled) { pending=true; continue; } // No fetch of quarantined or broken blocks.
    const month=`${source.year}-${String(source.month).padStart(2,"0")}-01`;
    try {
      const cash=parseCashGrid(await read(source),{...source,firstRow:1,source:source.sourceId},today);
      crossCheckCashSales(cash.rows,sales);
      if (!dryRun) {
        const ok=await rpc("portal_apply_cash_month",{p_run_id:runId,p_store_id:source.store,p_month:month,p_opening:cash.opening,p_rows:cash.rows});
        if (ok!==true) { failed=true; continue; } // The month RPC already persisted its precise warning.
      }
    } catch (error) {
      failed=true;
      if (!dryRun) await rpc("portal_record_cash_failure",{p_store_id:source.store,p_month:month,p_code:error instanceof Error ? error.message : "SYNC_FAILED"});
      console.error("Cash month not published; previous verified values retained. Review private source/status.");
    }
  }
  if (!dryRun) await rpc("portal_finish_sheets_run",{p_run_id:runId});
  if (failed) process.exitCode=1;
  console.log(dryRun ? "Dry run finished; no database writes performed." : "Sales and independently verified cash months processed.");
  if (pending) console.log("Some cash months remain disabled for source review.");
} catch (error) {
  const code = error instanceof Error && error.message === "SOURCE_VALIDATION_FAILED" ? error.message : "SYNC_FAILED";
  if (supabase && serviceKey) {
    try { await rpc("portal_record_sync_failure",{p_run_id:runId,p_code:code}); } catch { /* GitHub failure notifications remain the fallback. */ }
  }
  console.error(`${code}: previous verified data retained. Review the private source and connection settings.`);
  process.exitCode = 1;
}
