import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Clock3,
  Flag,
  Leaf,
  Pause,
  UserRound,
} from "lucide-react";
import {
  canEdit,
  shortDate,
  stores,
  today,
  type Goal,
  type Session,
} from "@/lib/domain";

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function StatusBadge({ status }: { status: Goal["status"] }) {
  const Icon =
    status === "完了"
      ? Check
      : status === "進行中"
        ? Clock3
        : status === "保留"
          ? Pause
          : Circle;
  return (
    <span
      className={`status-badge status-${["未着手", "進行中", "完了", "保留"].indexOf(status)}`}
    >
      <Icon size={13} />
      {status}
    </span>
  );
}
export function Progress({
  value,
  label = "達成率",
}: {
  value: number;
  label?: string;
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Leaf size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children ?? "小さな一歩から、はじめましょう。"}</p>
    </div>
  );
}
export function GoalCard({
  goal,
  session,
  index,
  detail,
  complete,
  showStore = false,
}: {
  goal: Goal;
  session: Session;
  index: number;
  detail: (g: Goal) => void;
  complete: (g: Goal) => void;
  showStore?: boolean;
}) {
  const overdue =
    goal.due < today() && goal.status !== "完了" && goal.status !== "保留";
  return (
    <article
      className={`goal-card ${goal.status === "完了" ? "is-complete" : ""}`}
    >
      <div className="goal-card-top">
        <span className="goal-number">
          ACTION {String(index + 1).padStart(2, "0")}
        </span>
        <StatusBadge status={goal.status} />
      </div>
      {showStore && (
        <span className="store-tag">
          {stores.find((s) => s.id === goal.storeId)?.short}
        </span>
      )}
      <h3>
        <button onClick={() => detail(goal)}>
          {goal.title}
          <ArrowUpRight size={17} />
        </button>
      </h3>
      <p className="goal-action">{goal.action}</p>
      <div className="goal-meta">
        <span>
          <UserRound size={14} />
          {goal.assignee}
        </span>
        <span className={overdue ? "overdue" : ""}>
          <Flag size={14} />
          {shortDate(goal.due)}
          {overdue ? " 期限超過" : " まで"}
        </span>
      </div>
      <div className="goal-card-footer">
        {canEdit(session, goal.storeId) && goal.status !== "完了" ? (
          <button className="complete-button" onClick={() => complete(goal)}>
            <span className="check-box">
              <Check size={12} />
            </span>
            完了にする
          </button>
        ) : goal.status === "完了" ? (
          <span className="completed-label">
            <CheckCheck size={16} />
            一歩、前に進みました
          </span>
        ) : (
          <span className="muted small">閲覧のみ</span>
        )}
        <button className="text-button" onClick={() => detail(goal)}>
          詳細
          <ChevronRight size={15} />
        </button>
      </div>
    </article>
  );
}
