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
 const [zoom, setZoom] = useState(0.7);
 const [displayMode, setDisplayMode] = useState("interactive");
 useEffect(() => {
  const element = dialog.current;
  const previousOverflow = document.body.style.overflow;
  element?.showModal();
  document.body.style.overflow = "hidden";
  return () => { element?.close(); document.body.style.overflow = previousOverflow; };
 }, []);
 const original = new URL(selected.externalUrl!);
 const gid = new URLSearchParams(original.hash.slice(1)).get("gid");
 if (displayMode === "preview") original.pathname = original.pathname.replace(/\/edit$/, "/preview");
 original.search = "";
 if (displayMode === "interactive") original.searchParams.set("rm", "minimal");
 if (gid) original.searchParams.set("gid", gid);
 return <dialog ref={dialog} aria-labelledby="cost-sheet-title" onCancel={onClose}
  style={{position:"fixed", inset:0, margin:"auto", padding:0, border:"1px solid #dce6df", borderRadius:10, width:"96vw", maxWidth:1440, height:"94dvh", maxHeight:"94dvh", background:"#fff", color:"#18352c"}}>
  <div style={{display:"flex", flexDirection:"column", height:"100%", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)", boxSizing:"border-box"}}>
   <header style={{padding:"6px 10px", borderBottom:"1px solid #dce6df", flexShrink:0}}>
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12}}>
     <h2 id="cost-sheet-title" style={{fontSize:14, lineHeight:1.3, margin:0}}>原価管理表</h2>
     <button type="button" autoFocus onClick={onClose} style={{minHeight:36, fontSize:13, lineHeight:1.2, padding:"5px 10px"}}>閉じる</button>
    </div>
    <nav aria-label="原価管理の店舗" style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:4}}>
     {sheets.map(sheet => <button type="button" key={sheet.id} aria-pressed={sheet.id === selected.id} onClick={()=>onSelect(sheet.id)}
      style={{minHeight:36, fontSize:13, lineHeight:1.2, padding:"5px 12px", border:"1px solid #285c49", borderRadius:8, background:sheet.id === selected.id ? "#285c49" : "#fff", color:sheet.id === selected.id ? "#fff" : "#285c49"}}>
      {sheet.id === "honten-recipe-costs" ? "本店" : sheet.id === "hanoura-recipe-costs" ? "羽ノ浦店" : sheet.title}
     </button>)}
     <label style={{display:"flex", alignItems:"center", gap:4, fontSize:12}}>表示
      <select aria-label="シートの表示方法" value={displayMode} onChange={e=>setDisplayMode(e.target.value)} style={{width:130, minHeight:36, padding:4, fontSize:13}}>
       <option value="interactive">通常（選択・編集）</option><option value="preview">閲覧用</option>
      </select>
     </label>
     <label style={{display:"flex", alignItems:"center", gap:4, fontSize:12}}>倍率
      <select aria-label="表の表示倍率" value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:76, minHeight:36, padding:"4px", fontSize:13}}>
       {[0.5,0.6,0.7,0.85,1].map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}
      </select>
     </label>
    </nav>
    <p style={{fontSize:11, lineHeight:1.4, margin:"4px 0 0"}}>本店は表の「仕込み名」でレシピを選べます（編集権限が必要）。空白・ログイン画面になる場合は、次のリンクから開いてください。 <a href={selected.externalUrl} target="_blank" rel="noopener noreferrer">レシピをGoogleで開く</a></p>
   </header>
   <div style={{flex:1, minHeight:0, overflow:"hidden", position:"relative"}}>
    <iframe key={`${selected.id}-${displayMode}`} src={original.toString()} title={selected.title} style={{position:"absolute", top:0, left:0, width:`${100/zoom}%`, height:`${100/zoom}%`, maxWidth:"none", transform:`scale(${zoom})`, transformOrigin:"top left", border:0, background:"#f5f7f5"}} />
   </div>
  </div>
 </dialog>;
}
