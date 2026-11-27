import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const root='automation/hanoura-cashbook/';
const html=readFileSync(root+'Index.html','utf8');
const code=readFileSync(root+'Core.gs','utf8')+'\n'+readFileSync(root+'Server.gs','utf8')+'\nvar CASHBOOK_HTML_ = '+JSON.stringify(html)+';\n';
const output=process.argv[2]||'/tmp/hanoura-cashbook-delivery';mkdirSync(output,{recursive:true});writeFileSync(output+'/Code.gs',code,{mode:0o600});writeFileSync(output+'/appsscript.json',readFileSync(root+'appsscript.json'),{mode:0o600});console.log('Built Apps Script package without production configuration.');
