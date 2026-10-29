"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, FileText, Search, ShieldCheck } from "lucide-react";
import { documents, type PortalDocument } from "@/lib/documents";
import type { Role } from "@/lib/domain";
import { Empty } from "./ui";
export function Library({ role, openDocument }: { role: Role; openDocument: (d: PortalDocument) => void; }) {
 const [query, setQuery] = useState("");
 const [category, setCategory] = useState("すべて");
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const allowed = documents.filter(d => d.roles.includes(role));
 const results = allowed.filter(d => (category === "すべて" || d.category === category) && [d.title,d.description,d.sections.flat().join(" ")].join(" ").includes(query));
 const sheets = allowed.filter(d => d.category === "原価・レシピ" && d.externalUrl);
 const selected = sheets.find(d => d.id === selectedId);
 return (<>
 <div className="page-intro"><div><p className="eyebrow">KNOWLEDGE FOR OUR EVERYDAY.</p><h1>社内資料・お知らせ</h1><p className="muted">必要なときに、必要な情報を。安心して働くための場所。</p></div><BookOpen className="intro-icon" size={35}/></div>
 <div className="library-note"><ShieldCheck size={24}/><div><h3>安心して使える情報を、チームへ。</h3><p>原価管理表はポータル内の大きな画面で開き、本店・羽ノ浦店を切り替えられます。閲覧には共有先のGoogleアカウントでのログインが必要です。本店と羽ノ浦店は別カードです。羽ノ浦店の現行レシピは共有待ちのため、参考・未照合の表示をご確認ください。</p></div></div>
 <div className="library-controls"><div className="search-field"><Search size={18}/><input aria-label="資料を検索" placeholder="資料のタイトル・キーワードを検索" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="category-tabs">{["すべて",...new Set(allowed.map(d=>d.category))].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)} className={category===c?"active":""}>{c}</button>)}</div></div>
 <p className="list-caption">{results.length} 件の資料<span>Googleスプレッドシート・使い方サンプル</span></p>
 <div className="document-grid">{results.map(d=>{
 const content=(<><span className="document-icon"><FileText size={27}/></span><span className="category-tag">{d.category}</span><h2>{d.title}</h2><p>{d.description}</p><div><span>{d.externalUrl?(d.category === "原価・レシピ" ? "ポータル内で大きく表示" : "Googleスプレッドシートを開く"):"更新 "+d.date.replaceAll("-",".")+" / v"+d.version}</span><ArrowUpRight size={20}/></div></>);
 if (d.externalUrl && d.category === "原価・レシピ") return <button type="button" className="document-card" key={d.id} onClick={()=>setSelectedId(d.id)}>{content}</button>;
 return d.externalUrl ? <a className="document-card" key={d.id} href={d.externalUrl} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"none"}}>{content}</a> : <button className="document-card" key={d.id} onClick={()=>openDocument(d)}>{content}</button>;
 })}</div>
 {selected && <CostSheetViewer selected={selected} sheets={sheets} onSelect={setSelectedId} onClose={()=>setSelectedId(null)} />}
 {!results.length&&<Empty title="該当する資料がありません">キーワードや分類を変えてお試しください。</Empty>}
 </>);
}


function CostSheetViewer({ selected, sheets, onSelect, onClose }: {
 selected: PortalDocument;
 sheets: PortalDocument[];
 onSelect: (id: string) => void;
 onClose: () => void;
}) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const element = dialog.current;
  const previousOverflow = document.body.style.overflow;
  element?.showModal();
  document.body.style.overflow = "hidden";
  return () => { element?.close(); document.body.style.overflow = previousOverflow; };
 }, []);
 const original = new URL(selected.externalUrl!);
 const gid = new URLSearchParams(original.hash.slice(1)).get("gid");
 original.pathname = original.pathname.replace(/\/edit$/, "/preview");
 original.search = "";
 if (gid) original.searchParams.set("gid", gid);
 return <dialog ref={dialog} aria-labelledby="cost-sheet-title" onCancel={onClose}
  style={{position:"fixed", inset:0, margin:0, padding:0, border:0, width:"100vw", maxWidth:"none", height:"100dvh", maxHeight:"none", background:"#fff", color:"#18352c"}}>
  <div style={{display:"flex", flexDirection:"column", height:"100%", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)", boxSizing:"border-box"}}>
   <header style={{padding:"12px 16px", borderBottom:"1px solid #dce6df", flexShrink:0}}>
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12}}>
     <h2 id="cost-sheet-title" style={{fontSize:18, margin:0}}>原価管理表</h2>
     <button type="button" autoFocus onClick={onClose} style={{minHeight:44, padding:"8px 16px"}}>閉じる</button>
    </div>
    <nav aria-label="原価管理の店舗" style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:8}}>
     {sheets.map(sheet => <button type="button" key={sheet.id} aria-pressed={sheet.id === selected.id} onClick={()=>onSelect(sheet.id)}
      style={{minHeight:44, padding:"8px 20px", border:"1px solid #285c49", borderRadius:8, background:sheet.id === selected.id ? "#285c49" : "#fff", color:sheet.id === selected.id ? "#fff" : "#285c49"}}>
      {sheet.id === "honten-recipe-costs" ? "本店" : sheet.id === "hanoura-recipe-costs" ? "羽ノ浦店" : sheet.title}
     </button>)}
    </nav>
    <p style={{fontSize:12, lineHeight:1.6, margin:"8px 0 0"}}>表示されない場合は、共有されたGoogleアカウントでログインしてください。 <a href={selected.externalUrl} target="_blank" rel="noopener noreferrer">Googleで開く・編集</a></p>
   </header>
   <iframe key={selected.id} src={original.toString()} title={selected.title} style={{width:"100%", flex:1, minHeight:0, border:0, background:"#f5f7f5"}} />
  </div>
 </dialog>;
}
