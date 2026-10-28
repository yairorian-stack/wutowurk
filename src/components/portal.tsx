"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  ExternalLink,
  History,
  House,
  Info,
  Leaf,
  MapPin,
  NotebookPen,
  Pencil,
  Settings2,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  canEdit,
  canRead,
  isGlobal,
  roles,
  saveGoal,
  shortDate,
  stores,
  today,
  weekLabel,
  weekStart,
  type Audit,
  type Goal,
  type StoreId,
} from "@/lib/domain";
import { getStorageIssue, updatePortal, usePortal } from "@/lib/store";
import type { PortalDocument } from "@/lib/documents";
import { Home } from "./home";
import { Plans } from "./plans";
import { VisionMap } from "./vision";
import { Library } from "./library";
import { Settings } from "./settings";
import { Finance } from "./finance";
import { SelfEvaluation } from "./self-evaluation";
import { Shifts } from "./shifts";
import { Garbage } from "./garbage";
import { useMember } from "./member-context";
import { Dialog } from "./dialog";
import { GoalEditor } from "./goal-editor";
import { Empty, StatusBadge } from "./ui";

const navigation = [
  { id: "home", href: "/", label: "ホーム", subtitle: "HOME", icon: House },
  {
    id: "vision",
    href: "/vision",
    label: "2046年ビジョン",
    subtitle: "OUR VISION",
    icon: Compass,
  },
  {
    id: "plans",
    href: "/plans",
    label: "週次アクション",
    subtitle: "WEEKLY ACTION",
    icon: CalendarCheck2,
  },
  {
    id: "daily",
    href: "/daily",
    label: "売上・日報",
    subtitle: "DAILY RECORD",
    icon: NotebookPen,
  },
  {
    id: "shifts",
    href: "/shifts",
    label: "シフト",
    subtitle: "TEAM SHIFT",
    icon: CalendarDays,
  },
  {
    id: "library",
    href: "/library",
    label: "社内資料",
    subtitle: "LIBRARY",
    icon: BookOpen,
  },
  {
    id: "self-evaluation",
    href: "/self-evaluation",
    label: "自己評価",
    subtitle: "SELF REFLECTION",
    icon: ClipboardCheck,
  },
] as const;
type View = (typeof navigation)[number]["id"] | "settings" | "garbage";
type Modal =
  | { kind: "edit"; goalId?: string; storeId: StoreId; week: string }
  | { kind: "detail"; id: string }
  | { kind: "history"; items: Audit[] }
  | { kind: "document"; document: PortalDocument }
  | { kind: "help" }
  | { kind: "notices" }
  | null;

const subscribeHydration = () => () => {};
export function Portal({ view }: { view: View }) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  if (!hydrated)
    return (
      <main className="loading-portal" aria-busy="true">
        <Sprout size={32} />
        <p>WUTO-WURK</p>
        <span>成長ノートをひらいています…</span>
      </main>
    );
  return <PortalContent view={view} />;
}
function PortalContent({ view }: { view: View }) {
  const storedState = usePortal();
  const member = useMember();
  const state = member
    ? {
        ...storedState,
        session: {
          role: member.role,
          storeId: member.store_id ?? storedState.session.storeId,
        },
      }
    : storedState;
  const [selectedScope, setSelectedScope] = useState<StoreId | "all" | null>(
    null,
  );
  const scope = isGlobal(state.session.role)
    ? (selectedScope ?? state.session.storeId)
    : state.session.storeId;
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const currentStore = stores.find((s) => s.id === state.session.storeId)!;
  const currentNav = navigation.find((n) => n.id === view);
  function notify(message: string) {
    setToast(message);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  function openGoal(
    goal?: Goal,
    storeId: StoreId = state.session.storeId,
    week: string = weekStart(today()),
  ) {
    setModal({
      kind: "edit",
      goalId: goal?.id,
      storeId: goal?.storeId ?? storeId,
      week: goal?.week ?? week,
    });
  }
  function complete(goal: Goal) {
    try {
      updatePortal((s) => saveGoal(s, { ...goal, status: "完了" }, goal.id));
      notify("目標を完了にしました。おつかれさまです！");
    } catch (e) {
      notify(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  function selectStore(value: StoreId | "all") {
    if (value === "all") {
      setSelectedScope("all");
      return;
    }
    try {
      updatePortal((s) => ({
        ...s,
        session: { ...s.session, storeId: value },
      }));
      setSelectedScope(value);
    } catch (e) {
      notify(e instanceof Error ? e.message : "切り替えできませんでした");
    }
  }
  const workflow = {
    state,
    scope,
    openGoal,
    complete,
    detail: (g: Goal) => setModal({ kind: "detail", id: g.id }),
  };
  const detailGoal =
    modal?.kind === "detail"
      ? state.goals.find((g) => g.id === modal.id)
      : undefined;
  return (
    <div className="portal-shell">
      <a href="#main-content" className="skip-link">
        本文へスキップ
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="WUTO-WURK ホーム">
          <span className="brand-symbol">
            w<span>•</span>
          </span>
          <span>
            <strong>WUTO-WURK</strong>
            <small>GROWTH PORTAL</small>
          </span>
        </Link>
        <div className="sidebar-divider" />
        <p className="nav-caption">わたしたちの成長ノート</p>
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {navigation.map((n) => (
            <Link
              href={n.href}
              key={n.id}
              className={clsx("nav-item", view === n.id && "active")}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>
                {n.label}
                <small>{n.subtitle}</small>
              </span>
              {view === n.id && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-message">
          <Sprout size={28} strokeWidth={1.3} />
          <p>
            人が育ち、店舗が育ち、
            <br />
            地域が育つ。
          </p>
          <span>GROW TOGETHER.</span>
        </div>
        <div className="sidebar-bottom">
          <Link
            href="/settings"
            className={clsx(
              "sidebar-settings",
              view === "settings" && "selected",
            )}
          >
            <Settings2 size={18} />
            {member ? "アカウント設定" : "試作品設定"}
            <ChevronRight size={14} />
          </Link>
          <div className="sidebar-profile">
            <span className="avatar">
              {member?.display_name.slice(0, 1) ?? "見"}
            </span>
            <div>
              <strong>{member?.display_name ?? "見学用アカウント"}</strong>
              <small>
                {member?.job_title ?? `${roles[state.session.role]}・デモ`}
              </small>
            </div>
            <Leaf size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Growth Portal</span>
            <ChevronRight size={13} />
            <strong>
              {currentNav?.label ??
                (view === "garbage" ? "本店ゴミ出し" : "試作品設定")}
            </strong>
          </div>
          <Link href="/" className="mobile-brand">
            WUTO-WURK<span>GROWTH PORTAL</span>
          </Link>
          <div className="topbar-actions">
            <div className="store-select">
              <MapPin size={16} />
              {isGlobal(state.session.role) ? (
                <select
                  value={scope}
                  aria-label="表示する店舗"
                  onChange={(e) =>
                    selectStore(e.target.value as StoreId | "all")
                  }
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="all">全社・すべての店舗</option>
                </select>
              ) : (
                <span>{currentStore.short}</span>
              )}
            </div>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label="お知らせを開く"
              onClick={() => setModal({ kind: "notices" })}
            >
              <Bell size={20} />
              <i />
            </button>
            <button
              className="icon-button help-button"
              aria-label="使い方を開く"
              onClick={() => setModal({ kind: "help" })}
            >
              <CircleHelp size={20} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="prototype-label">
            <span className="prototype-dot" />
            {member ? "ログイン中" : "体験版"}
            <span className="prototype-label-text">
              {view === "self-evaluation"
                ? "自己評価は送信・自動保存されません"
                : view === "shifts"
                  ? "シフトは送信・自動保存されません"
                  : view === "garbage"
                    ? "提供日程の確認用 / 自動通知は未稼働"
                    : view === "daily"
                      ? "提供売上とサンプルは別々に管理 / 保存はこのブラウザー内"
                      : "架空のサンプルデータ / このブラウザー内に保存"}
            </span>
            <Link href="/settings">
              {member
                ? "アカウント設定"
                : `${roles[state.session.role]}でプレビュー`}
              <EyeIcon />
            </Link>
          </div>
          {getStorageIssue() && (
            <p role="alert" className="form-error">
              {getStorageIssue()}
            </p>
          )}
          {view === "home" && <Home {...workflow} />}
          {view === "plans" && (
            <Plans
              {...workflow}
              notify={notify}
              history={(items) => setModal({ kind: "history", items })}
            />
          )}
          {view === "vision" && <VisionMap state={state} notify={notify} />}
          {view === "daily" && (
            <>
              <div className="evaluation-entry-inline">
                <span>成長を振り返り、次の目標へ。</span>
                <Link href="/self-evaluation" className="button secondary">
                  <ClipboardCheck size={18} />
                  自己評価シートを作成
                </Link>
                <Link href="/shifts" className="button secondary">
                  <CalendarDays size={18} />
                  店舗のシフトを見る
                </Link>
                <Link href="/garbage" className="button secondary">
                  本店ゴミ出し
                </Link>
              </div>
              <Finance
                session={state.session}
                scope={scope}
                selectStore={selectStore}
                notify={notify}
              />
            </>
          )}
          {view === "self-evaluation" && (
            <SelfEvaluation initialStoreId={state.session.storeId} />
          )}
          {view === "shifts" && <Shifts scope={scope} />}
          {view === "garbage" && <Garbage />}
          {view === "library" && (
            <Library
              role={state.session.role}
              openDocument={(document) =>
                setModal({ kind: "document", document })
              }
            />
          )}
          {view === "settings" && <Settings state={state} notify={notify} />}
          <footer className="site-footer">
            <span>
              WUTO-WURK <i />
              GROWTH PORTAL
            </span>
            <p>人に良いを基本とし 心の温もりを与え　ワクワクと感動を創造し続けます</p>
            <small>© {today().slice(0, 4)} 有限会社ウト・ウーク</small>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="モバイルナビゲーション">
        {navigation.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            aria-current={view === n.id ? "page" : undefined}
            className={view === n.id ? "active" : ""}
          >
            <n.icon size={21} />
            <span>
              {n.id === "vision"
                ? "ビジョン"
                : n.id === "plans"
                  ? "週次目標"
                  : n.id === "daily"
                    ? "売上日報"
                    : n.label}
            </span>
          </Link>
        ))}
        <Link
          href="/settings"
          aria-current={view === "settings" ? "page" : undefined}
          className={view === "settings" ? "active" : ""}
        >
          <Settings2 size={21} />
          <span>設定</span>
        </Link>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="通知を閉じる" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal?.kind === "edit" && (
        <GoalEditor
          goal={state.goals.find((g) => g.id === modal.goalId)}
          storeId={modal.storeId}
          week={modal.week}
          close={() => setModal(null)}
          saved={() => notify("目標を保存しました")}
        />
      )}
      {modal?.kind === "detail" &&
        detailGoal &&
        canRead(state.session, detailGoal.storeId) && (
          <Dialog
            title="今週の一歩"
            subtitle={`${stores.find((s) => s.id === detailGoal.storeId)?.name} / ${weekLabel(detailGoal.week)}`}
            close={() => setModal(null)}
            wide
          >
            <div className="goal-detail">
              <StatusBadge status={detailGoal.status} />
              <h3>{detailGoal.title}</h3>
              <p>{detailGoal.action}</p>
              <div className="detail-meta">
                <span>
                  <UserRound size={16} />
                  {detailGoal.assignee}
                </span>
                <span>期限 {shortDate(detailGoal.due)}</span>
              </div>
              <dl>
                {(
                  [
                    ["outcome", "成果"],
                    ["reflection", "振り返り"],
                    ["nextStep", "次週への課題"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{detailGoal[key] || "まだ記録されていません"}</dd>
                  </div>
                ))}
              </dl>
              <div className="detail-update">
                最終更新：
                {new Date(detailGoal.updatedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </div>
              <div className="dialog-footer">
                <button
                  className="button secondary"
                  onClick={() =>
                    setModal({
                      kind: "history",
                      items: state.history.filter(
                        (h) => h.entityId === detailGoal.id,
                      ),
                    })
                  }
                >
                  <History size={16} />
                  履歴
                </button>
                {canEdit(state.session, detailGoal.storeId) && (
                  <button
                    className="button primary"
                    onClick={() => openGoal(detailGoal)}
                  >
                    <Pencil size={16} />
                    目標を編集
                  </button>
                )}
              </div>
            </div>
          </Dialog>
        )}
      {modal?.kind === "history" && (
        <Dialog
          title="変更履歴"
          subtitle="試作品内の操作を、新しい順に表示します。"
          close={() => setModal(null)}
          wide
        >
          {modal.items.length ? (
            <div className="audit-list">
              {modal.items.map((h) => (
                <article key={h.id}>
                  <span className="audit-icon">
                    <History size={16} />
                  </span>
                  <div>
                    <h3>
                      {h.operation}
                      <span>{h.actor}</span>
                    </h3>
                    <p>{h.after?.title}</p>
                    <time>
                      {new Date(h.at).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })}
                    </time>
                    <details>
                      <summary>変更内容を見る</summary>
                      <div className="audit-comparison">
                        <div>
                          <strong>変更前</strong>
                          <AuditContent data={h.before} />
                        </div>
                        <ArrowRight size={15} />
                        <div>
                          <strong>変更後</strong>
                          <AuditContent data={h.after} />
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="変更履歴はまだありません">
              目標の作成・編集やビジョンの編集をすると、ここに記録されます。
            </Empty>
          )}
        </Dialog>
      )}
      {modal?.kind === "document" &&
        modal.document.roles.includes(state.session.role) && (
          <Dialog
            title={modal.document.title}
            subtitle={`サンプル資料 / v${modal.document.version} / 更新 ${modal.document.date}`}
            close={() => setModal(null)}
            wide
          >
            <article className="document-reader">
              <span className="category-tag">{modal.document.category}</span>
              {modal.document.sections.map(([title, body]) => (
                <section key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </section>
              ))}
              <p className="info-note">
                <Info size={16} />
                検討用のサンプルです。承認済みの就業規則・社内規程ではありません。
              </p>
            </article>
          </Dialog>
        )}
      {modal?.kind === "help" && (
        <Dialog title="小さな一歩を、ここから。" close={() => setModal(null)}>
          <div className="help-content">
            <Sprout size={35} />
            <p>
              ホームで今週の目標を確認し、週次アクションでチームの一歩を記録します。ビジョンマップから、2046年までの道のりをたどれます。
            </p>
            <p>
              「試作品設定」で権限と所属店舗を切り替えられます。すべて架空のデータです。
            </p>
            <Link
              className="button primary"
              href="/library"
              onClick={() => setModal(null)}
            >
              使い方の資料を見る
              <ArrowRight size={17} />
            </Link>
          </div>
        </Dialog>
      )}
      {modal?.kind === "notices" && (
        <Dialog
          title="チームへのお知らせ"
          subtitle="サンプルのお知らせです。"
          close={() => setModal(null)}
        >
          <div className="help-content">
            <span className="category-tag">ポータル</span>
            <h3>成長ポータルへ、ようこそ。</h3>
            <p>
              今週の目標と、未来への一歩をここから。操作方法は「社内資料」で確認できます。
            </p>
            <Link
              href="/library"
              className="button secondary"
              onClick={() => setModal(null)}
            >
              資料を開く
              <ExternalLink size={16} />
            </Link>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function EyeIcon() {
  return <ChevronRight size={13} />;
}
function AuditContent({ data }: { data: Audit["before"] }) {
  if (!data) return <p className="muted">記録なし（新規作成）</p>;
  const labels: Record<string, string> = {
    title: "目標",
    action: "行動",
    assignee: "担当",
    due: "期限",
    status: "状況",
    outcome: "成果",
    reflection: "振り返り",
    nextStep: "次週",
    week: "対象週",
    start: "開始年",
    end: "終了年",
    countries: "国数",
    state: "状態",
    goal: "目標",
    metric: "指標",
    gate: "移行条件",
    storeId: "店舗",
  };
  return (
    <dl>
      {Object.entries(data)
        .filter(([key]) => key in labels)
        .map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{String(value) || "—"}</dd>
          </div>
        ))}
    </dl>
  );
}
