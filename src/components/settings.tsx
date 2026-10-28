"use client";
import {
  Database,
  Eye,
  Info,
  LockKeyhole,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import {
  roles,
  stores,
  type PortalState,
  type Role,
  type StoreId,
} from "@/lib/domain";
import { updatePortal } from "@/lib/store";
import { useMember } from "./member-context";
import { MemberSettings } from "./member-settings";

export function Settings({
  state,
  notify,
}: {
  state: PortalState;
  notify: (s: string) => void;
}) {
  const member = useMember();
  if (member) return <MemberSettings member={member} />;
  function change(role: Role, storeId: StoreId) {
    try {
      updatePortal((s) => ({ ...s, session: { role, storeId } }));
      notify("権限プレビューを切り替えました");
    } catch (e) {
      notify(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">TRY THE PORTAL, TOGETHER.</p>
          <h1>試作品設定</h1>
          <p className="muted">チームそれぞれの立場で、使い心地を確かめる。</p>
        </div>
        <Eye className="intro-icon" size={34} />
      </div>
      <div className="info-note setting-notice">
        <Info size={21} />
        <p>
          この画面は、サンプルデータで表示と操作を確認するためのものです。
          <strong>
            ログイン・本人確認・安全な権限制御はまだ実装していません。
          </strong>
        </p>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <span className="settings-icon">
            <UserRound size={23} />
          </span>
          <h2>権限プレビュー</h2>
          <p className="muted">
            役職名とシステム権限は、別々に管理する設計です。
          </p>
          <label>
            確認するシステム権限
            <select
              aria-label="確認するシステム権限"
              value={state.session.role}
              onChange={(e) =>
                change(e.target.value as Role, state.session.storeId)
              }
            >
              {Object.entries(roles).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            所属店舗
            <select
              aria-label="所属店舗"
              value={state.session.storeId}
              onChange={(e) =>
                change(state.session.role, e.target.value as StoreId)
              }
            >
              {stores.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="demo-profile">
            <span className="avatar">見</span>
            <div>
              <strong>見学用アカウント</strong>
              <p>役職名：サンプル役職 / 架空データ</p>
            </div>
          </div>
        </section>
        <section className="panel settings-panel">
          <span className="settings-icon">
            <ShieldCheck size={23} />
          </span>
          <h2>プレビューできる範囲</h2>
          <ul className="permissions-list">
            <li>
              <Eye size={18} />
              <div>
                <strong>一般スタッフ</strong>
                <p>所属店の目標・ビジョン・スタッフ向け資料の閲覧</p>
              </div>
            </li>
            <li>
              <Store size={18} />
              <div>
                <strong>店舗管理者</strong>
                <p>所属店の週次目標・日報・現金出納帳の作成・更新</p>
              </div>
            </li>
            <li>
              <ShieldCheck size={18} />
              <div>
                <strong>全社管理者・システム管理者</strong>
                <p>全店舗の目標とビジョンの編集、管理者向け資料の閲覧</p>
              </div>
            </li>
          </ul>
          <p className="small muted">
            全社・システム管理者のユーザー管理、資料承認、システム設定は本番実装の対象です。
          </p>
        </section>
      </div>
      <section className="panel storage-panel">
        <Database size={26} />
        <div>
          <h2>このブラウザーに、サンプルを保存</h2>
          <p>
            目標・ビジョン・変更履歴・プレビュー設定をブラウザー内に保存します。再読み込みしても残りますが、別の端末には共有されません。ブラウザーデータの削除で失われます。
          </p>
          <p>
            <LockKeyhole size={15} />
            個人情報や社内機密を入力せず、架空のデータでお試しください。
          </p>
        </div>
      </section>
    </>
  );
}
