// Child-process integration fixture. Never calls Google, Supabase or SMTP.
import { writeFileSync } from "node:fs";
const requests=[];
const grid=[
  ["メールアドレス","氏名","役職","所属店舗","権限","閲覧範囲","有効/無効"],
  ["admin@example.invalid","架空 管理者","総合責任者","両店舗","全社管理者","両店舗","有効"],
  ["reader@example.invalid","架空 両店","社員","本店","一般スタッフ","両店舗","有効"],
];
globalThis.fetch=async (input,init={})=>{
  const url=String(input);requests.push({url,body:url.includes('/rpc/')?JSON.parse(init.body):null});
  writeFileSync(process.env.STAFF_SYNC_TEST_REPORT,JSON.stringify(requests));
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture'});
  if(url.includes('/values/'))return Response.json({values:process.env.STAFF_SYNC_BAD_HEADER?[['INVALID'],...grid.slice(1)]:grid});
  if(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'))return Response.json({sheets:[{properties:{sheetId:889901237,title:'スタッフ権限',gridProperties:{rowCount:500,columnCount:7}},protectedRanges:process.env.STAFF_SYNC_UNPROTECTED?[]:[{range:{sheetId:889901237},warningOnly:false}]}]});
  if(url.endsWith('/rpc/portal_apply_staff_access_sync'))return Response.json({total:2,added:1,updated:0,disabled:0});
  throw new Error('Unexpected endpoint in staff-only sync');
};
