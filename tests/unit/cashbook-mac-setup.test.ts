import{describe,it,expect}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';
import{join}from'node:path';
import{tmpdir}from'node:os';
import vm from'node:vm';
import{install,validatePayload,parseToolJSON}from'../../automation/hanoura-cashbook/mac-setup/setup.mjs';
const id='fictional_script_identifier',deployment='fictional_deployment_identifier';
function fixture(){
 const base=mkdtempSync(join(tmpdir(),'cashbook-installer-test-')),bundle=join(base,'bundle'),root=join(base,'local');
 mkdirSync(join(bundle,'payload'),{recursive:true});
 writeFileSync(join(bundle,'owner.json'),JSON.stringify({email:'owner@example.invalid'}));
 writeFileSync(join(bundle,'payload','Code.gs'),'function ownerBootstrapIfNeeded_(){}\nfunction autoInstallOwner_(){}');
 writeFileSync(join(bundle,'payload','appsscript.json'),JSON.stringify({webapp:{access:'ANYONE',executeAs:'USER_DEPLOYING'},dependencies:{enabledAdvancedServices:[{userSymbol:'Sheets',serviceId:'sheets'}]}}));
 const sdk=join(root,'tools/node_modules/@google/clasp/build/src');mkdirSync(sdk,{recursive:true});writeFileSync(join(sdk,'index.js'),'');
 const calls:string[][]=[],opened:string[]=[];
 const execute=async(_cmd:string,args:string[])=>{
  calls.push(args);
  if(args.includes('show-authorized-user'))return JSON.stringify({loggedIn:true,email:'owner@example.invalid'});
  if(args.includes('create-script')){mkdirSync(join(root,'project'),{recursive:true});writeFileSync(join(root,'project','.clasp.json'),JSON.stringify({scriptId:id}));return JSON.stringify({scriptId:id});}
  if(args.includes('create-deployment')||args.includes('update-deployment'))return JSON.stringify({deploymentId:deployment});
  if(args.includes('open-web-app'))return JSON.stringify({url:`https://script.google.com/macros/s/${deployment}/exec?authUser=owner%40example.invalid`});
  return '{}';
 };
 const options={root,execute,log:()=>{},open:(url:string)=>{opened.push(url);}};
 return{bundle,root,calls,opened,options,cleanup:()=>rmSync(base,{recursive:true,force:true})};
}
describe('Mac自動設定（Google接続なし）',()=>{
 it('checks payload without making Google calls; limits management scopes',async()=>{const f=fixture();try{const result=await install(f.bundle,{...f.options,check:true});expect(result.valid).toBe(true);expect(f.calls).toHaveLength(0);expect(result.authScopes?.join(' ')).not.toMatch(/cloud-platform|service.management|logging/);}finally{f.cleanup();}});
 it('refuses anonymous deployment',()=>{const f=fixture();try{const path=join(f.bundle,'payload/appsscript.json'),manifest=JSON.parse(readFileSync(path,'utf8'));manifest.webapp.access='ANYONE_ANONYMOUS';writeFileSync(path,JSON.stringify(manifest));expect(()=>validatePayload(f.bundle)).toThrow();}finally{f.cleanup();}});
 it('creates, pushes and verifies a Google-issued URL; rerun does not recreate or redeploy',async()=>{const f=fixture();try{const result=await install(f.bundle,f.options);expect(result.url).toBe(`https://script.google.com/macros/s/${deployment}/exec`);expect(readFileSync(join(f.root,'専用URL.txt'),'utf8')).not.toContain('authUser');await install(f.bundle,f.options);for(const command of['create-script','push','create-deployment'])expect(f.calls.filter(a=>a.includes(command))).toHaveLength(1);expect(existsSync(join(f.root,'creation-pending'))).toBe(false);}finally{f.cleanup();}});
 it('rejects a different owner before creating anything',async()=>{const f=fixture();try{await expect(install(f.bundle,{...f.options,execute:async()=>JSON.stringify({loggedIn:true,email:'other@example.invalid'})})).rejects.toThrow('管理者アカウント');expect(existsSync(join(f.root,'creation-pending'))).toBe(false);}finally{f.cleanup();}});
 it('rejects an unrelated local project before push',async()=>{const f=fixture();try{mkdirSync(join(f.root,'project'),{recursive:true});writeFileSync(join(f.root,'project/.clasp.json'),JSON.stringify({scriptId:'another-project'}));await expect(install(f.bundle,f.options)).rejects.toThrow('上書きせず');expect(f.calls.some(a=>a.includes('push'))).toBe(false);}finally{f.cleanup();}});
 it('opens API settings only for a known disabled API error, allowing safe retry',async()=>{const f=fixture();try{const execute=f.options.execute;await expect(install(f.bundle,{...f.options,execute:async(cmd:string,args:string[])=>{if(args.includes('create-script'))throw new Error('Apps Script API is disabled https://script.google.com/home/usersettings');return execute(cmd,args);}})).rejects.toThrow('スイッチ');expect(f.opened).toEqual(['https://script.google.com/home/usersettings']);expect(existsSync(join(f.root,'creation-pending'))).toBe(false);}finally{f.cleanup();}});
 it('does not recreate a project following an ambiguous creation error',async()=>{const f=fixture();try{const execute=f.options.execute;await expect(install(f.bundle,{...f.options,execute:async(cmd:string,args:string[])=>{if(args.includes('create-script'))throw new Error('network response lost');return execute(cmd,args);}})).rejects.toThrow('network');await expect(install(f.bundle,f.options)).rejects.toThrow('重複を避ける');expect(f.calls.some(a=>a.includes('push'))).toBe(false);}finally{f.cleanup();}});
 it('rejects an untrusted URL returned by a tool',async()=>{const f=fixture();try{const execute=f.options.execute;await expect(install(f.bundle,{...f.options,execute:async(cmd:string,args:string[])=>args.includes('open-web-app')?JSON.stringify({url:'https://example.invalid/exec'}):execute(cmd,args)})).rejects.toThrow('公開URL');expect(existsSync(join(f.root,'専用URL.txt'))).toBe(false);}finally{f.cleanup();}});
});
describe('Private bootstrap（架空設定のみ）',()=>{
 it('sets a fixed roster without sheet access; admin proof is required to restrict sharing/install',()=>{
  const config={spreadsheetId:'fictional',sourceGid:7,startDate:'2026-11-25',ownerEmail:'owner@example.invalid',users:{'owner@example.invalid':{role:'admin',enabled:true}}};
  const properties=new Map<string,string>();let changes=0,installed=0;
  const context=vm.createContext({props_:()=>({getProperty:(k:string)=>properties.get(k)||null,setProperty:(k:string,v:string)=>properties.set(k,v)}),config_:()=>({id:config.spreadsheetId}),hash_:(v:string)=>v,withLock_:(fn:()=>unknown)=>fn(),DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},getFileById:()=>({getSharingAccess:()=>'ANYONE',setSharing:()=>changes++})},installCashbook_:()=>installed++});
  vm.runInContext(readFileSync('automation/hanoura-cashbook/mac-setup/bootstrap.gs','utf8').replaceAll('__PRIVATE_CONFIG__',JSON.stringify(config)),context);
  vm.runInContext('ownerBootstrapIfNeeded_()',context);expect(changes).toBe(0);expect(installed).toBe(0);
  expect(()=>vm.runInContext("autoInstallOwner_({email:'other@example.invalid',role:'admin'})",context)).toThrow('管理者本人');
  expect(()=>vm.runInContext("autoInstallOwner_({email:'owner@example.invalid',role:'entry'})",context)).toThrow('管理者本人');
  vm.runInContext("autoInstallOwner_({email:'owner@example.invalid',role:'admin'})",context);expect(changes).toBe(1);expect(installed).toBe(1);
  vm.runInContext("autoInstallOwner_({email:'owner@example.invalid',role:'admin'})",context);expect(installed).toBe(1);expect(properties.has('CASHBOOK_PLAN')).toBe(false);
  properties.set('CASHBOOK_USERS','retained roster');vm.runInContext('ownerBootstrapIfNeeded_()',context);expect(properties.get('CASHBOOK_USERS')).toBe('retained roster');
  properties.set('CASHBOOK_SPREADSHEET_ID','different');expect(()=>vm.runInContext('ownerBootstrapIfNeeded_()',context)).toThrow('接続先');
 });
});

describe('確認した既存プロジェクトからの再開',()=>{
 const expected={spreadsheetId:'fictional_spreadsheet_id',sourceGid:7,emails:['owner@example.invalid','staff@example.invalid']};
 const remoteCode='var CashCore={}; function ownerSetup_(){} function saveCashbookDay(){} function verifyCashbookCode(){} // CASHBOOK_SPREADSHEET_ID fictional_spreadsheet_id 7 owner@example.invalid staff@example.invalid';
 function resume(f:ReturnType<typeof fixture>,code=remoteCode){
  writeFileSync(join(f.bundle,'owner.json'),JSON.stringify({email:'owner@example.invalid',resumeScriptId:id,expectedSource:expected}));
  writeFileSync(join(f.root,'creation-pending'),'ambiguous prior response');
  const execute=f.options.execute;
  return {...f.options,execute:async(cmd:string,args:string[])=>{
   if(args.includes('pull')){f.calls.push(args);const path=args[args.indexOf('-P')+1].replace(/\.clasp\.json$/,'');writeFileSync(join(path,'コード.js'),code);writeFileSync(join(path,'appsscript.json'),'{}');return JSON.stringify({pulledFiles:['コード.js','appsscript.json']});}
   return execute(cmd,args);
  }};
 }
 it('backs up and validates existing source before push; recovers pending creation without creating a project',async()=>{
  const f=fixture();try{const options=resume(f);await install(f.bundle,options);const state=JSON.parse(readFileSync(join(f.root,'installation.json'),'utf8'));expect(state.scriptId).toBe(id);expect(readFileSync(join(state.sourceBackup,'コード.js'),'utf8')).toBe(remoteCode);expect(existsSync(join(state.sourceBackup,'deployments-backup.json'))).toBe(true);expect(f.calls.some(a=>a.includes('create-script'))).toBe(false);expect(f.calls.findIndex(a=>a.includes('pull'))).toBeLessThan(f.calls.findIndex(a=>a.includes('push')));expect(existsSync(join(f.root,'creation-pending'))).toBe(false);const project=JSON.parse(readFileSync(join(f.root,'project/.clasp.json'),'utf8'));expect(project.rootDir).toBe(join(f.root,'project/managed'));expect(existsSync(join(project.rootDir,'Code.gs'))).toBe(true);await install(f.bundle,options);expect(f.calls.filter(a=>a.includes('push'))).toHaveLength(1);}finally{f.cleanup();}
 });
 it('does not push, clear the pending marker, or adopt a project whose source differs',async()=>{
  const f=fixture();try{await expect(install(f.bundle,resume(f,remoteCode.replace('fictional_spreadsheet_id','other_book')))).rejects.toThrow('一致しません');expect(f.calls.some(a=>a.includes('push'))).toBe(false);expect(existsSync(join(f.root,'creation-pending'))).toBe(true);expect(existsSync(join(f.root,'installation.json'))).toBe(false);}finally{f.cleanup();}
 });
 it('refuses conflicting local state instead of changing targets',async()=>{
  const f=fixture();try{const options=resume(f);writeFileSync(join(f.root,'installation.json'),JSON.stringify({scriptId:'unrelated_project'}));await expect(install(f.bundle,options)).rejects.toThrow('異なります');expect(f.calls.some(a=>a.includes('pull')||a.includes('push'))).toBe(false);}finally{f.cleanup();}
 });
 it('stops on extra remote source files without replacing them',async()=>{
  const f=fixture();try{const options=resume(f),execute=options.execute;await expect(install(f.bundle,{...options,execute:async(cmd:string,args:string[])=>{const result=await execute(cmd,args);if(args.includes('pull')){const path=args[args.indexOf('-P')+1].replace(/\.clasp\.json$/,'');writeFileSync(join(path,'別の業務.js'),'function other(){}');}return result;}})).rejects.toThrow('ファイル構成');expect(f.calls.some(a=>a.includes('push'))).toBe(false);}finally{f.cleanup();}
 });
 it('never uploads the initially pulled Code.js alongside the managed Code.gs',async()=>{
  const f=fixture();try{const execute=f.options.execute;await install(f.bundle,{...f.options,execute:async(cmd:string,args:string[])=>{const result=await execute(cmd,args);if(args.includes('create-script'))writeFileSync(join(f.root,'project/Code.js'),'function myFunction(){}');if(args.includes('push')){const project=JSON.parse(readFileSync(join(f.root,'project/.clasp.json'),'utf8'));expect(project.rootDir).toBe(join(f.root,'project/managed'));expect(existsSync(join(project.rootDir,'Code.js'))).toBe(false);}return result;}});}finally{f.cleanup();}
 });
});


describe('Google公式claspのURL応答',()=>{
 const url='https://script.google.com/macros/s/fictional_deployment/exec?authUser=owner%40example.invalid';
 it('accepts real clasp JSON followed by its browser-opening notice',()=>{
  for(const notice of [`Opening ${url} in your browser.`,`Open ${url} in your browser to continue.`])expect(parseToolJSON(JSON.stringify({url},null,2)+'\n'+notice+'\n','open-web-app')).toEqual({url});
 });
 it('rejects unrelated trailing output and mismatched URLs',()=>{
  for(const text of [JSON.stringify({url})+'\nUnexpected log',JSON.stringify({url})+'\nOpening https://script.google.com/macros/s/other/exec in your browser.'])expect(()=>parseToolJSON(text,'open-web-app')).toThrow();
  expect(()=>parseToolJSON(JSON.stringify({url})+`\nOpening ${url} in your browser.`,'create-deployment')).toThrow();
 });
 it('resumes completed deployment without pushing or publishing again',async()=>{
  const f=fixture();try{const execute=f.options.execute;let notices='broken';
   const options={...f.options,execute:async(cmd:string,args:string[])=>{const result=await execute(cmd,args);if(args.includes('open-web-app')&&notices==='broken')return 'unreadable initial response';if(args.includes('open-web-app')&&notices==='sdk'){const entry=JSON.parse(result);return result+`\nOpening ${entry.url} in your browser.\n`;}return result;}};
   await expect(install(f.bundle,options)).rejects.toThrow('応答');notices='sdk';await install(f.bundle,options);notices='json';await install(f.bundle,options);
   for(const command of ['push','create-deployment'])expect(f.calls.filter(args=>args.includes(command))).toHaveLength(1);
   expect(readFileSync(join(f.root,'専用URL.txt'),'utf8')).not.toContain('authUser');
  }finally{f.cleanup();}
 });
});


describe('登録メンバーの追加',()=>{
 it('adds only approved missing members once and preserves disabled members and manual revocation',()=>{
  const users={'owner@example.invalid':{name:'架空管理者',role:'admin',enabled:true},'old@example.invalid':{name:'架空既存',role:'entry',enabled:true},'new@example.invalid':{name:'架空追加',role:'entry',enabled:true}};
  const config={spreadsheetId:'fictional',sourceGid:7,startDate:'2026-11-25',ownerEmail:'owner@example.invalid',users};
  const existing={...users};delete (existing as Partial<typeof users>)['new@example.invalid'];existing['old@example.invalid'].enabled=false;
  const properties=new Map<string,string>([['CASHBOOK_USERS',JSON.stringify(existing)]]);
  const context=vm.createContext({props_:()=>({getProperty:(k:string)=>properties.get(k)||null,setProperty:(k:string,v:string)=>properties.set(k,v)}),hash_:(v:string)=>v,withLock_:(fn:()=>unknown)=>fn()});
  vm.runInContext(readFileSync('automation/hanoura-cashbook/mac-setup/bootstrap.gs','utf8').replaceAll('__PRIVATE_CONFIG__',JSON.stringify(config)),context);
  vm.runInContext('ownerBootstrapIfNeeded_()',context);
  const roster=JSON.parse(properties.get('CASHBOOK_USERS')!);expect(roster['new@example.invalid'].role).toBe('entry');expect(roster['old@example.invalid'].enabled).toBe(false);expect(roster['owner@example.invalid'].role).toBe('admin');
  delete roster['new@example.invalid'];properties.set('CASHBOOK_USERS',JSON.stringify(roster));vm.runInContext('ownerBootstrapIfNeeded_()',context);expect(JSON.parse(properties.get('CASHBOOK_USERS')!)['new@example.invalid']).toBeUndefined();
 });
});
