"use client";
import { useState } from "react";
import type { StoreId } from "@/lib/domain";
export function ShiftSnapshot({scope}:{scope:StoreId|"all"}) {
 const [failed,setFailed]=useState(false);
 if(scope==="honten")return null;
 return <section className="panel" aria-label="羽ノ浦店2026年11月シフト原本">
 <p className="eyebrow">HANOURA / NOVEMBER 2026</p>
 <h2>羽ノ浦店｜2026年11月シフト表</h2>
 <p><strong>2026年10月29日時点</strong>の共有原本です。変更される可能性があります。Airシフトからの自動同期ではありません。</p>
 <p className="small muted">横にスクロールして全日程を確認できます。「昼・夜・フル」の時刻・休憩は未確認のため、この画像から人数・労働時間を自動集計しません。下のカレンダーはCSV・手入力用の別表示です。</p>
 {failed?<p role="alert">シフト原本を表示できません。ログイン状態・所属店舗をご確認ください。改善しない場合は管理者にお知らせください。</p>:<div style={{overflowX:"auto",maxWidth:"100%",margin:"16px 0"}}><img src="/api/shifts/snapshot" alt="羽ノ浦店2026年11月1日から30日のシフト表。2026年10月29日時点。" onError={()=>setFailed(true)} style={{width:1801,maxWidth:"none",height:"auto",display:"block"}}/></div>}
 <a className="button secondary" href="/api/shifts/snapshot" target="_blank" rel="noopener noreferrer">シフト原本を別タブで拡大する</a>
 <p className="small muted">更新版の画像・PDF・CSVをご共有いただくと差し替えできます。閲覧は羽ノ浦店の承認済みメンバーと全社管理者に限定しています。</p>
 </section>;
}
