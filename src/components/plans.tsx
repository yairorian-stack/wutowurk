"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  ListFilter,
  Plus,
  Search,
} from "lucide-react";
import {
  addDays,
  canEdit,
  completion,
  shortDate,
  today,
  transferGoals,
  weekLabel,
  weekStart,
  type Audit,
} from "@/lib/domain";
import { updatePortal } from "@/lib/store";
import { Empty, GoalCard, Progress } from "./ui";
import type { WorkflowProps } from "./home";

export function Plans({
  state,
  scope,
  openGoal,
  detail,
  complete,
  notify,
  history,
}: WorkflowProps & {
  notify: (s: string) => void;
  history: (items: Audit[]) => void;
}) {
  const current = weekStart(today());
  const [week, setWeek] = useState(current);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const accessible = state.goals.filter(
    (g) => scope === "all" || g.storeId === scope,
  );
  const weekly = accessible.filter((g) => g.week === week);
  const results = accessible.filter(
    (g) =>
      (search
        ? `${g.title} ${g.action} ${g.outcome} ${g.reflection} ${g.nextStep}`
            .toLowerCase()
            .includes(search.toLowerCase())
        : g.week === week) &&
      (!assignee || g.assignee === assignee) &&
      (!due || g.due === due) &&
      (!status || g.status === status),
  );
  const editable = scope !== "all" && canEdit(state.session, scope);
  function transfer(unfinished: boolean) {
    if (scope === "all") return;
    try {
      updatePortal((s) =>
        transferGoals(
          s,
          scope,
          unfinished ? week : addDays(week, -7),
          unfinished ? addDays(week, 7) : week,
          unfinished,
        ),
      );
      setError("");
      notify(
        unfinished
          ? "未完了の目標を翌週へ繰り越しました"
          : "先週の目標を複製しました",
      );
      if (unfinished) {
        setWeek(addDays(week, 7));
        setSearch("");
        setAssignee("");
        setDue("");
        setStatus("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "移行できませんでした");
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">SMALL ACTIONS, MEANINGFUL GROWTH.</p>
          <h1>週次アクションプラン</h1>
          <p className="muted">
            チームで決める、今週の3つ。できたことを、次の一歩に。
          </p>
        </div>
        {editable && (
          <button
            className="button primary"
            disabled={weekly.length >= 3}
            onClick={() => openGoal(undefined, scope, week)}
          >
            <Plus size={18} />
            目標を追加<span className="button-count">{weekly.length}/3</span>
          </button>
        )}
      </div>
      <section className="panel plans-toolbar">
        <div className="week-navigation">
          <button
            className="icon-button"
            aria-label="前の週"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <span className="eyebrow">{week.slice(0, 4)} WEEKLY PLAN</span>
            <strong>
              <CalendarDays size={18} />
              {weekLabel(week)}
            </strong>
          </div>
          <button
            className="icon-button"
            aria-label="次の週"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight size={20} />
          </button>
          {week !== current && (
            <button className="text-button" onClick={() => setWeek(current)}>
              今週に戻る
            </button>
          )}
        </div>
        <label className="date-jump">
          週を選ぶ
          <input
            aria-label="対象週を選ぶ"
            type="date"
            value={week}
            onChange={(e) => {
              if (e.target.value) setWeek(weekStart(e.target.value));
            }}
          />
        </label>
      </section>
      <div className="plans-stats">
        <div>
          <span className="muted">この週の達成率</span>
          <strong>
            {completion(weekly)}
            <small>%</small>
          </strong>
          <Progress value={completion(weekly)} />
        </div>
        <div>
          <span className="muted">完了した目標</span>
          <strong>
            {weekly.filter((g) => g.status === "完了").length}
            <small> / {weekly.length} 件</small>
          </strong>
        </div>
        <div>
          <span className="muted">進行中の目標</span>
          <strong>
            {weekly.filter((g) => g.status === "進行中").length}
            <small> 件</small>
          </strong>
        </div>
      </div>
      <section className="plan-controls">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="過去の記録を検索"
            placeholder="過去の目標・成果・振り返りを検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="検索をクリア" onClick={() => setSearch("")}>
              ×
            </button>
          )}
        </div>
        <div className="filter-row">
          <ListFilter size={17} />
          <select
            aria-label="担当者で絞り込む"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">すべての担当者</option>
            {[...new Set(accessible.map((g) => g.assignee))].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            aria-label="達成状況で絞り込む"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">すべての状況</option>
            {["未着手", "進行中", "完了", "保留"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="due-filter">
            期限
            <input
              aria-label="期限で絞り込む"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          {(assignee || due || status) && (
            <button
              className="text-button"
              onClick={() => {
                setAssignee("");
                setDue("");
                setStatus("");
              }}
            >
              解除
            </button>
          )}
        </div>
      </section>
      <div className="plan-list-heading">
        <p>
          {search
            ? "全期間の検索結果"
            : week === current
              ? "今週の目標"
              : "選択した週の目標"}
          <span className="count-pill">{results.length}</span>
        </p>
        <button
          className="text-button"
          onClick={() =>
            history(
              state.history.filter(
                (h) =>
                  h.after &&
                  "storeId" in h.after &&
                  (scope === "all" || h.after.storeId === scope),
              ),
            )
          }
        >
          <History size={16} />
          変更履歴
        </button>
      </div>
      {results.length ? (
        <div className="goal-grid">
          {results.map((g, i) => (
            <div key={g.id}>
              {search && (
                <p className="search-week">
                  {g.week.slice(0, 4)}年 {shortDate(g.week)} の週
                </p>
              )}
              <GoalCard
                goal={g}
                session={state.session}
                index={i}
                detail={detail}
                complete={complete}
                showStore={scope === "all"}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={
              search || assignee || due || status
                ? "条件に合う目標がありません"
                : "この週の目標は、まだありません"
            }
          >
            {search || assignee || due || status
              ? "検索語や絞り込み条件を変えてみてください。"
              : "先週から複製するか、新しい目標を追加しましょう。"}
          </Empty>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {editable && (
        <div className="transfer-panel">
          <div>
            <Copy size={21} />
            <div>
              <h3>来週も、無理なく続けよう。</h3>
              <p>担当者と行動を引き継いで、入力の手間を減らせます。</p>
            </div>
          </div>
          <div>
            <button
              className="button secondary"
              onClick={() => transfer(false)}
            >
              <Copy size={16} />
              先週から複製
            </button>
            <button className="button secondary" onClick={() => transfer(true)}>
              未完了を翌週へ
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      <p className="gentle-note">
        {scope === "all"
          ? "目標の追加・複製・繰り越しは、ヘッダーから店舗を選んで行ってください。"
          : "1店舗・1週間で最大3件。繰り越しは元の記録を残し、移行先に未着手として登録します。"}
      </p>
    </>
  );
}
