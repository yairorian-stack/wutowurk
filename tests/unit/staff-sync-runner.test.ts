import { describe,expect,it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const {privateKey}=generateKeyPairSync("rsa",{modulusLength:1024});
function run(dry:boolean,bad=false,unprotected=false){
  const dir=mkdtempSync(join(tmpdir(),"staff-sync-test-")),report=join(dir,"report.json");
  try{
    const child=spawnSync(process.execPath,["--import","./tests/fixtures/staff-sync-fetch.mjs","scripts/sync-google-sheets.mjs","--staff-only",...(dry?["--dry-run"]:[])],{
      encoding:"utf8",env:{...process.env,
        STAFF_SYNC_TEST_REPORT:report,STAFF_SYNC_BAD_HEADER:bad?"yes":"",STAFF_SYNC_UNPROTECTED:unprotected?"yes":"",
        SHEETS_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:"test@fixture.iam.gserviceaccount.com",private_key:privateKey.export({format:"pem",type:"pkcs8"})}),
        SHEETS_SYNC_CONFIG:JSON.stringify({sales:{invalid:"deliberately"},cashSources:null,staffAccess:{spreadsheetId:"12345678901234567890",sheetId:889901237,tab:"スタッフ権限",range:"A1:G500"}}),
        SUPABASE_SYNC_URL:"https://abcdefghijklmnopqrst.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"fixture",GITHUB_RUN_ID:"staff-fixture",
      },
    });
    return {status:child.status,requests:JSON.parse(readFileSync(report,"utf8")) as {url:string;body?:{p_staff:{read_all_stores:boolean}[]}}[]};
  }finally{rmSync(dir,{recursive:true,force:true});}
}
describe("独立したスタッフ同期",()=>{
  it("スタッフ台帳の保護が解除された場合は本番書き込みを止める",()=>{
    const r=run(false,false,true);expect(r.status).toBe(1);expect(r.requests.some(x=>x.url.includes('/portal_apply_staff_access_sync'))).toBe(false);
  });
  it("売上・出納帳が不正な設定でもスタッフだけを検証しdry-runでDBを書かない",()=>{
    const r=run(true);expect(r.status).toBe(0);expect(r.requests).toHaveLength(3);
    expect(r.requests.every(x=>!x.url.includes("supabase")&&!x.url.includes("/auth/"))).toBe(true);
  });
  it("本番実行もスタッフRPCだけを書き込み、両店舗閲覧を保持する",()=>{
    const r=run(false);expect(r.status).toBe(0);
    const writes=r.requests.filter(x=>x.url.includes('/rpc/'));
    expect(writes).toHaveLength(1);expect(writes[0].url).toContain('/portal_apply_staff_access_sync');
    expect(writes[0].body?.p_staff[1].read_all_stores).toBe(true);
  });
  it("不正な台帳をDBへ反映しない",()=>{
    const r=run(true,true);expect(r.status).toBe(1);expect(r.requests.filter(x=>x.url.includes('/rpc/'))).toHaveLength(0);
  });
});
