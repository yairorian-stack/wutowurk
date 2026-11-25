// Loopback-only demonstration server with fictional data. Never a production backend.
import http from 'node:http';
import {readFileSync}from'node:fs';
import vm from'node:vm';
const ctx=vm.createContext({});vm.runInContext(readFileSync('automation/hanoura-cashbook/Core.gs','utf8'),ctx);
const states=new Map();
const mock=`window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,name)=>(...args)=>fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(r=>r.json()).then(r=>r.error?failure({message:r.error}):success(r.data)).catch(failure)})}}}}}};`;
const html=readFileSync('automation/hanoura-cashbook/Index.html','utf8').replace('__RECEIPT_ID__','""').replace('<script>','<script>'+mock);
http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/rpc'){
 let body='';for await(const chunk of req){body+=chunk;if(body.length>7000000){res.writeHead(413).end();return;}}
 try{const {name,args}=JSON.parse(body);let data;
 if(name==='requestCashbookCode')data={challenge:'fictional-challenge',message:'架空の確認コードを用いています'};
 else if(name==='verifyCashbookCode'){if(args[2]!=='123456')throw new Error('確認コードを確認してください');const token=args[0];states.set(token,{record:null,failOnce:token.includes('network'),attempts:0});data={token};}
 else if(name==='getCashbookBootstrap'){const state=states.get(args[0]);if(!state)throw new Error('再ログインしてください');data={today:'2026-11-25',start:'2026-11-25',ledgerVersion:'fixture-ledger',person:'架空スタッフ',user:{name:'架空スタッフ',role:'entry',key:args[0]},record:state.record,previous:500,previousDate:'2026-11-24',vendors:['架空商店'],enabled:true};}
 else if(name==='saveCashbookDay'){const state=states.get(args[0]);if(!state)throw new Error('再ログインしてください');state.attempts++;if(state.failOnce&&state.attempts===1)throw new Error('架空の通信エラー。入力を残して再送してください');const p=ctx.CashCore.normalize(args[1].payload,'2026-11-25','2026-11-25'),totals=ctx.CashCore.calculate(p,500);state.record={payload:p,revision:1};data={ok:true,date:p.date,revision:1,totals};}
 else if(name==='logoutCashbook')data=true;
 else throw new Error('fixture method');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}return;
 }res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(3125,'127.0.0.1');
