// Runs on the owner's Mac. Credentials remain in the owner's private local folder.
import {spawn,spawnSync}from'node:child_process';
import{mkdirSync,existsSync,readFileSync,writeFileSync,chmodSync,copyFileSync,unlinkSync,mkdtempSync,readdirSync}from'node:fs';
import{homedir}from'node:os';
import{join,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';
const SCOPES=['https://www.googleapis.com/auth/script.projects','https://www.googleapis.com/auth/script.deployments','https://www.googleapis.com/auth/script.webapp.deploy','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'];
export function validatePayload(folder){
 const owner=JSON.parse(readFileSync(join(folder,'owner.json'),'utf8'));
 const manifest=JSON.parse(readFileSync(join(folder,'payload','appsscript.json'),'utf8'));
 const code=readFileSync(join(folder,'payload','Code.gs'),'utf8');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)||manifest.webapp?.access!=='ANYONE'||manifest.webapp?.executeAs!=='USER_DEPLOYING'||!manifest.dependencies?.enabledAdvancedServices?.some(s=>s.userSymbol==='Sheets'&&s.serviceId==='sheets')||!code.includes('function ownerBootstrapIfNeeded_')||!code.includes('function autoInstallOwner_'))throw new Error('設定ファイルを確認できません。配布されたフォルダをそのまま使ってください。');
 if(owner.resumeScriptId&&(!/^[a-zA-Z0-9_-]{20,}$/.test(owner.resumeScriptId)||!owner.expectedSource?.spreadsheetId||!Number.isInteger(owner.expectedSource.sourceGid)||!Array.isArray(owner.expectedSource.emails)||!owner.expectedSource.emails.includes(owner.email)))throw new Error('再開対象の設定が不完全です');
 return {owner,codeHash:createHash('sha256').update(code+'\n'+JSON.stringify(manifest)).digest('hex')};
}
export function verifyRecoverySource(folder,expected){
 const files=readdirSync(folder).filter(name=>!name.startsWith('.'));
 const scripts=files.filter(name=>/\.(?:js|gs)$/.test(name));
 if(scripts.length!==1||files.some(name=>name!=='appsscript.json'&&name!==scripts[0]))throw new Error('対象プロジェクトのファイル構成が異なります。変更せず停止しました');
 const code=readFileSync(join(folder,scripts[0]),'utf8');
 const markers=['var CashCore','function ownerSetup_','function saveCashbookDay','function verifyCashbookCode','CASHBOOK_SPREADSHEET_ID',expected.spreadsheetId,String(expected.sourceGid),...expected.emails];
 if(!markers.every(marker=>code.includes(marker)))throw new Error('出納帳の接続先・利用者・コードが一致しません。変更せず停止しました');
 JSON.parse(readFileSync(join(folder,'appsscript.json'),'utf8'));
}
function redact(s){return String(s).replace(/Bearer\s+[^\s"']+/gi,'Bearer [非表示]').replace(/((?:access_token|refresh_token|client_secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[非表示]').replace(/([?&]code=)[^&\s]+/g,'$1[非表示]');}
export async function install(bundle,options={}){
 const {owner,codeHash}=validatePayload(bundle);
 if(options.check)return {valid:true,authScopes:SCOPES,codeHash};
 process.umask(0o077);
 const root=options.root||join(homedir(),'Library','Application Support','WUTO-WURK-Cashbook');
 const authDir=join(root,'authorization'),project=join(root,'project'),tools=join(root,'tools');
 for(const dir of [root,authDir,project,tools]){mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);}
 const authFile=join(root,'.clasprc.json'),projectFile=join(project,'.clasp.json'),stateFile=join(root,'installation.json'),pendingFile=join(root,'creation-pending');
 const save=state=>writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});
 let state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
 const sdk=join(tools,'node_modules','@google','clasp','build','src','index.js');
 const execute=options.execute||((cmd,args,opts={})=>new Promise((resolve,reject)=>{
   const child=spawn(cmd,args,{cwd:opts.cwd||root,env:process.env,stdio:['inherit','pipe','pipe'],shell:false});let stdout='',stderr='';
   child.stdout.on('data',chunk=>{stdout+=chunk;if(opts.live)process.stdout.write(redact(chunk));});
   child.stderr.on('data',chunk=>{stderr+=chunk;if(opts.live)process.stderr.write(redact(chunk));});
   child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(redact(stderr||stdout||'設定処理が停止しました'))));
 }));
 const log=options.log||console.log;
 const open=options.open||(url=>spawnSync('/usr/bin/open',[url],{stdio:'ignore'}));
 const cli=async(args,{json=false,live=false,authProject=false,projectOverride=null}={})=>{
   const settings=projectOverride?join(projectOverride,'.clasp.json'):authProject?join(authDir,'.clasp.json'):projectFile;
   let output;
   try{output=await execute(process.execPath,[sdk,'-A',authFile,'-P',settings,...(json?['--json']:[]),...args],{live,cwd:projectOverride||(authProject?authDir:project)});}
   catch(error){
     if(projectOverride&&/has not enabled|Apps Script API.*disabled|script\.google\.com\/home\/usersettings/i.test(error.message)){
       open('https://script.google.com/home/usersettings');
       throw new Error('Googleの「Apps Script API」を有効にしてから、このファイルをもう一度開いてください。既存のコードは変更していません');
     }
     throw error;
   }
   if(!json)return output;
   try{return JSON.parse(output);}catch{throw new Error('Google公式ツールの応答を確認できません。設定を止めました。');}
 };
 if(!existsSync(sdk)){
   log('1/5 Google公式の設定ツールを準備しています…');
   const npm=join(dirname(process.execPath),'..','lib','node_modules','npm','bin','npm-cli.js');
   if(!existsSync(npm))throw new Error('Node.js付属のnpmを確認できません。配布された起動ファイルから実行してください。');
   await execute(process.execPath,[npm,'install','--prefix',tools,'--cache',join(root,'npm-cache'),'--ignore-scripts','--no-audit','--no-fund','--save-exact','@google/clasp@3.4.1']);
 }
 writeFileSync(join(authDir,'.clasp.json'),JSON.stringify({scriptId:'local-authorization-only',rootDir:'.'}),{mode:0o600});
 writeFileSync(join(authDir,'appsscript.json'),JSON.stringify({timeZone:'Asia/Tokyo',runtimeVersion:'V8',oauthScopes:SCOPES}),{mode:0o600});
 let account=await cli(['show-authorized-user'],{json:true,authProject:true});
 if(!account.loggedIn){
   log('2/5 ブラウザーで、元帳を編集できる木元さんのGoogleアカウントを選び、認証してください。認証コードをチャットに送る必要はありません。');
   await cli(['login','--use-project-scopes'],{live:true,authProject:true});
   if(existsSync(authFile))chmodSync(authFile,0o600);
   account=await cli(['show-authorized-user'],{json:true,authProject:true});
 }
 if(!account.loggedIn||String(account.email).toLowerCase()!==owner.email.toLowerCase())throw new Error('予定している管理者アカウントと異なります。アカウントを確認してください。他の人の認証情報をコピーしないでください。');
 if(owner.resumeScriptId){
   if(state.scriptId&&state.scriptId!==owner.resumeScriptId)throw new Error('Macに記録された対象と異なります。別のプロジェクトへは変更しません');
   if(existsSync(projectFile)&&JSON.parse(readFileSync(projectFile,'utf8')).scriptId!==owner.resumeScriptId)throw new Error('Macの接続先が異なります。上書きせず停止しました');
   if(!state.recoveryVerified){
     log('3/5 指定された既存プロジェクトを読み取り、接続先・利用者を照合しています…');
     const backup=mkdtempSync(join(root,'source-backup-'));
     writeFileSync(join(backup,'.clasp.json'),JSON.stringify({scriptId:owner.resumeScriptId,rootDir:'.'}),{mode:0o600});
     await cli(['pull'],{json:true,projectOverride:backup});
     verifyRecoverySource(backup,owner.expectedSource);
     // Preserve both the original code and the list of existing deployments locally.
     const deployments=await cli(['list-deployments'],{json:true,projectOverride:backup});
     writeFileSync(join(backup,'deployments-backup.json'),JSON.stringify(deployments,null,2),{mode:0o600});
     state={...state,scriptId:owner.resumeScriptId,recoveryVerified:true,sourceBackup:backup};save(state);
     writeFileSync(projectFile,JSON.stringify({scriptId:state.scriptId,rootDir:join(project,'managed')}),{mode:0o600});
     if(existsSync(pendingFile))unlinkSync(pendingFile);
     log('既存コードをこのMacにバックアップしました。プロジェクトを新規作成せず再開します。');
   }
   if(!existsSync(projectFile))writeFileSync(projectFile,JSON.stringify({scriptId:state.scriptId,rootDir:join(project,'managed')}),{mode:0o600});
   if(existsSync(pendingFile))unlinkSync(pendingFile);
 }
 if(existsSync(projectFile)){
   const local=JSON.parse(readFileSync(projectFile,'utf8'));
   if(!state.scriptId||state.scriptId!==local.scriptId)throw new Error('登録済みプロジェクトの識別情報が一致しません。既存コードを上書きせず停止しました。');
 }else{
   if(existsSync(pendingFile))throw new Error('前回の作成結果が未確認です。重複を避けるため自動再作成しません。プロジェクト一覧を確認してください。');
   log('3/5 専用のApps Scriptプロジェクトを新規作成します。既存のスクリプトは上書きしません。');
   writeFileSync(pendingFile,new Date().toISOString(),{mode:0o600});
   try{
     const created=await cli(['create-script','--type','standalone','--title','816 現金出納帳 入力専用','--rootDir','.'],{json:true});
     if(!/^[a-zA-Z0-9_-]{15,}$/.test(created.scriptId||''))throw new Error('作成結果が未確認です。');
     state.scriptId=created.scriptId;save(state);unlinkSync(pendingFile);
   }catch(error){
     if(/has not enabled|Apps Script API.*disabled|script\.google\.com\/home\/usersettings/i.test(error.message)){
       if(existsSync(pendingFile))unlinkSync(pendingFile);
       open('https://script.google.com/home/usersettings');
       throw new Error('Googleの「Apps Script API」を有効にする画面を開きました。スイッチを有効にしてから、このファイルをもう一度開いてください。');
     }throw error;
   }
 }
 // Keep the managed upload isolated from clasp's initially pulled Code.js.
 const managed=join(project,'managed');mkdirSync(managed,{recursive:true,mode:0o700});
 writeFileSync(projectFile,JSON.stringify({scriptId:state.scriptId,rootDir:managed}),{mode:0o600});
 if(state.codeHash!==codeHash){
   log('4/5 許可ユーザー・接続先・画面・保存処理を登録しています…');
   for(const file of ['Code.gs','appsscript.json'])copyFileSync(join(bundle,'payload',file),join(managed,file));
   // Only a tracked new project or an explicitly verified recovery target can reach this command.
   await cli(['push','--force'],{json:true});
   let deployed;
   if(state.deploymentId)deployed=await cli(['update-deployment',state.deploymentId,'--description','816 protected cashbook'],{json:true});
   else deployed=await cli(['create-deployment','--description','816 protected cashbook'],{json:true});
   if(!/^[a-zA-Z0-9_-]{15,}$/.test(deployed.deploymentId||''))throw new Error('公開結果が未確認です。');
   state.deploymentId=deployed.deploymentId;state.codeHash=codeHash;save(state);
 }
 log('5/5 Googleが発行したURLを確認しています…');
 const entry=await cli(['open-web-app',state.deploymentId],{json:true});
 const url=new URL(entry.url);
 if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname))throw new Error('Googleの公開URLを確認できません。');
 url.search='';url.hash='';
 writeFileSync(join(root,'専用URL.txt'),url.href+'\n',{mode:0o600});
 log('\n専用URLを発行しました（初回Google承認・管理者ログイン・残高確認はまだ必要です）。\n'+url.href+'\n\n開いたサイトでGoogleの承認と、登録メールに届く6桁コードでのログインを行ってください。認証情報をチャットへ送らないでください。');
 return {url:url.href,scriptId:state.scriptId};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 install(dirname(fileURLToPath(import.meta.url)),{check:process.argv.includes('--check')}).then(()=>{if(process.argv.includes('--check'))console.log('自動設定ファイルの構成確認に合格しました。Googleへの変更は行っていません。');}).catch(error=>{console.error('\n設定は完了していません。\n'+redact(error.message));process.exitCode=1;});
}
