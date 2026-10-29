"use client";
import { useState } from "react";
import { ArrowUpRight, BookOpen, FileText, Search, ShieldCheck } from "lucide-react";
import { documents, type PortalDocument } from "@/lib/documents";
import type { Role } from "@/lib/domain";
import { Empty } from "./ui";
export function Library({ role, openDocument }: { role: Role; openDocument: (d: PortalDocument) => void; }) {
 const [query, setQuery] = useState("");
 const [category, setCategory] = useState("すべて");
 const allowed = documents.filter(d => d.roles.includes(role));
 const results = allowed.filter(d => (category === "すべて" || d.category === category) && [d.title,d.description,d.sections.flat().join(" ")].join(" ").includes(query));
 return (<>
 <div className="page-intro"><div><p className="eyebrow">KNOWLEDGE FOR OUR EVERYDAY.</p><h1>社内資料・お知らせ</h1><p className="muted">必要なときに、必要な情報を。安心して働くための場所。</p></div><BookOpen className="intro-icon" size={35}/></div>
 <div className="library-note"><ShieldCheck size={24}/><div><h3>安心して使える情報を、チームへ。</h3><p>原価管理表はGoogleスプレッドシートの最新データを開きます。閲覧には共有先のGoogleアカウントでのログインが必要です。羽ノ浦店の原価管理表は準備中です。</p></div></div>
 <div className="library-controls"><div className="search-field"><Search size={18}/><input aria-label="資料を検索" placeholder="資料のタイトル・キーワードを検索" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="category-tabs">{["すべて",...new Set(allowed.map(d=>d.category))].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)} className={category===c?"active":""}>{c}</button>)}</div></div>
 <p className="list-caption">{results.length} 件の資料<span>Googleスプレッドシート・使い方サンプル</span></p>
 <div className="document-grid">{results.map(d=>{
 const content=(<><span className="document-icon"><FileText size={27}/></span><span className="category-tag">{d.category}</span><h2>{d.title}</h2><p>{d.description}</p><div><span>{d.externalUrl?"Googleスプレッドシートを開く":"更新 "+d.date.replaceAll("-",".")+" / v"+d.version}</span><ArrowUpRight size={20}/></div></>);
 return d.externalUrl ? <a className="document-card" key={d.id} href={d.externalUrl} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"none"}}>{content}</a> : <button className="document-card" key={d.id} onClick={()=>openDocument(d)}>{content}</button>;
 })}</div>
 {!results.length&&<Empty title="該当する資料がありません">キーワードや分類を変えてお試しください。</Empty>}
 </>);
}
