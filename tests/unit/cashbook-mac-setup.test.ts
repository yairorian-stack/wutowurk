import{describe,it,expect}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';
import{join}from'node:path';
import{tmpdir}from'node:os';
import vm from'node:vm';
import{install,validatePayload}from'../../automation/hanoura-cashbook/mac-setup/setup.mjs';
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
  const context=vm.createContext({props_:()=>({getProperty:(k:string)=>properties.get(k)||null,setProperty:(k:string,v:string)=>properties.set(k,v)}),config_:()=>({id:config.spreadsheetId}),DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},getFileById:()=>({getSharingAccess:()=>'ANYONE',setSharing:()=>changes++})},installCashbook_:()=>installed++});
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
