// Private configuration is supplied as a local file, never stored in Git.
import{readFileSync,writeFileSync,mkdirSync,copyFileSync,chmodSync}from'node:fs';
import{join,resolve}from'node:path';
import{execFileSync}from'node:child_process';
const [configFile,outputArg]=process.argv.slice(2);
if(!configFile||!outputArg)throw new Error('Usage: node scripts/build-cashbook-mac-setup.mjs private-config.json output-directory');
const config=JSON.parse(readFileSync(configFile,'utf8'));
if(!/^[a-zA-Z0-9_-]{20,}$/.test(config.spreadsheetId||'')||!Number.isInteger(config.sourceGid)||!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate||'')||!config.users?.[config.ownerEmail]?.enabled||config.users[config.ownerEmail].role!=='admin')throw new Error('Invalid private configuration');
const output=resolve(outputArg),payload=join(output,'payload'),source='automation/hanoura-cashbook';
mkdirSync(payload,{recursive:true,mode:0o700});chmodSync(output,0o700);chmodSync(payload,0o700);
execFileSync(process.execPath,['scripts/build-hanoura-cashbook.mjs',payload]);
const helper=readFileSync(join(source,'mac-setup/bootstrap.gs'),'utf8').replaceAll('__PRIVATE_CONFIG__',JSON.stringify(config));
const code=helper+'\n'+readFileSync(join(payload,'Code.gs'),'utf8');
writeFileSync(join(payload,'Code.gs'),code,{mode:0o600});
writeFileSync(join(output,'owner.json'),JSON.stringify({email:config.ownerEmail,...(config.resumeScriptId?{resumeScriptId:config.resumeScriptId,expectedSource:{spreadsheetId:config.spreadsheetId,sourceGid:config.sourceGid,emails:Object.keys(config.users)}}:{})}),{mode:0o600});
for(const file of ['setup.mjs','816自動設定.command'])copyFileSync(join(source,'mac-setup',file),join(output,file));
chmodSync(join(output,'816自動設定.command'),0o755);
copyFileSync(join(source,'mac-setup/使い方.md'),join(output,'使い方.md'));
console.log('Private Mac setup package built. No Google changes or emails sent.');
