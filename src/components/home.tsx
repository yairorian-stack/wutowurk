"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Flag,
  Heart,
  Leaf,
  Megaphone,
  Plus,
  Sprout,
  Target,
} from "lucide-react";
import {
  addDays,
  canEdit,
  completion,
  shortDate,
  weekLabel,
  weekStart,
  today,
  type Goal,
  type PortalState,
  type StoreId,
} from "@/lib/domain";
import { BrandArt } from "./brand-art";
import { Empty, GoalCard, Progress, SectionHeading } from "./ui";

export type WorkflowProps = {
  state: PortalState;
  scope: StoreId | "all";
  openGoal: (goal?: Goal, storeId?: StoreId, week?: string) => void;
  detail: (goal: Goal) => void;
  complete: (goal: Goal) => void;
};
export function Home({
  state,
  scope,
  openGoal,
  detail,
  complete,
}: WorkflowProps) {
  const week = weekStart(today());
  const goals = state.goals.filter(
    (g) => g.week === week && (scope === "all" || g.storeId === scope),
  );
  const done = goals.filter((g) => g.status === "完了").length;
  const progress = completion(goals);
  const activePhase =
    state.visions.find(
      (v) =>
        v.start <= Number(today().slice(0, 4)) &&
        v.end >= Number(today().slice(0, 4)),
    ) ?? state.visions[0];
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">YOUR SMALL STEPS, OUR BIG FUTURE.</p>
          <h1>
            今日の一歩が、
            <span className="mobile-break" />
            未来をつくる。
          </h1>
          <p className="muted">おつかれさまです。今週も、チームで一歩ずつ。</p>
        </div>
        <span className="today-chip">
          <CalendarDays size={16} />
          {today().replaceAll("-", ".")}
        </span>
      </div>
      <div className="home-layout">
        <section className="vision-banner">
          <div className="vision-banner-copy">
            <span className="light-tag">
              <span />
              OUR VISION 2046
            </span>
            <h2>
              一皿から、
              <br />
              その土地を好きになる。
            </h2>
            <p>
              阿南から世界へ。地域の人々に必要とされる
              <br className="desktop-only" />
              飲食ブランドを、みんなの力で。
            </p>
            <Link href="/vision">
              私たちが目指す未来
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <BrandArt />
          <div className="banner-caption">作る・囲む・残る</div>
        </section>
        <Link href="/daily" className="daily-home-link">
          <span className="daily-home-icon">
            <CalendarDays size={23} />
          </span>
          <span>
            <strong>今日の売上と、チームの1日を記録する。</strong>
            <small>店舗別の日報・現金出納帳・月次進捗はこちら</small>
          </span>
          <ArrowRight size={20} />
        </Link>
        <section className="weekly-section" aria-labelledby="weekly-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THIS WEEK’S CHALLENGE</p>
              <h2 id="weekly-title">
                今週の、私たちの目標
                <span className="count-pill">{goals.length}</span>
              </h2>
            </div>
            <Link href="/plans" className="text-button">
              週次アクションへ
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="week-summary">
            <div className="week-summary-label">
              <span className="calendar-block">
                <CalendarDays size={22} />
              </span>
              <div>
                <span className="small muted">
                  {today().slice(0, 4)}年・
                  {scope === "all" ? "全店舗" : "選択店舗"}のアクション
                </span>
                <strong>{weekLabel(week)}</strong>
              </div>
            </div>
            <div className="summary-progress">
              <div>
                <span>今週の達成率</span>
                <strong>
                  {progress}
                  <small>%</small>
                </strong>
              </div>
              <Progress value={progress} />
              <p>
                {done} / {goals.length} 件完了 <span>一歩ずつ、着実に。</span>
              </p>
            </div>
          </div>
          {goals.length ? (
            <div className={`goal-grid ${scope === "all" ? "all-stores" : ""}`}>
              {goals.map((g, i) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  index={i}
                  session={state.session}
                  detail={detail}
                  complete={complete}
                  showStore={scope === "all"}
                />
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty title="今週の目標は、これからです。">
                ミーティングで、チームの一歩を決めましょう。
              </Empty>
              {scope !== "all" && canEdit(state.session, scope) && (
                <button
                  className="button primary empty-add"
                  onClick={() => openGoal(undefined, scope, week)}
                >
                  <Plus size={17} />
                  今週の目標をつくる
                </button>
              )}
            </div>
          )}
          <p className="gentle-note">
            <Sprout size={15} />
            大きな変化は、小さな積み重ねから。目標は週3つまで、無理なく続けましょう。
          </p>
        </section>
        <div className="home-lower">
          <section className="panel journey-panel">
            <SectionHeading eyebrow="OUR JOURNEY" title="2046年への道のり">
              <Compass size={20} />
            </SectionHeading>
            <div className="journey-line">
              <span className="journey-current">
                <i />
                {activePhase.start}–{activePhase.end}
              </span>
              <span className="journey-dash" />
              <span className="journey-future">
                2046 <Flag size={15} />
              </span>
            </div>
            <h3>{activePhase.title}</h3>
            <p className="muted">
              まずは、ここ阿南から。
              <br />
              私たちの「らしさ」を、一緒に育てる。
            </p>
            <div className="journey-bottom">
              <span>
                <strong>10</strong>カ国へ、つながる未来
              </span>
              <Link
                href="/vision"
                className="round-link"
                aria-label="ビジョンマップを見る"
              >
                <ArrowUpRight size={20} />
              </Link>
            </div>
          </section>
          <section className="panel notices-panel">
            <SectionHeading eyebrow="INFORMATION" title="チームへのお知らせ">
              <Megaphone size={19} />
            </SectionHeading>
            <Link href="/library" className="notice">
              <span className="notice-date">
                {shortDate(today())}
                <i className="new-dot" />
              </span>
              <div>
                <span className="category-tag">ポータル</span>
                <h3>成長ポータルへ、ようこそ。</h3>
                <p>毎週の目標と、未来への一歩をここから。</p>
              </div>
              <ChevronRight size={17} />
            </Link>
            <Link href="/library" className="notice">
              <span className="notice-date">
                {shortDate(addDays(today(), -2))}
              </span>
              <div>
                <span className="category-tag beige">チーム</span>
                <h3>週次ミーティングのヒント</h3>
                <p>今週の「できた」を、みんなで共有しよう。</p>
              </div>
              <ChevronRight size={17} />
            </Link>
            <div className="notice-footer">
              <span className="muted small">サンプルのお知らせ</span>
              <Link href="/library" className="text-button">
                資料・お知らせ一覧
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>
        </div>
        <section className="values-strip">
          <div>
            <Heart size={22} />
            <span className="eyebrow">OUR PHILOSOPHY</span>
          </div>
          <p>
            人に良いを基本とし 心の温もりを与え
            <br className="mobile-only" /> ワクワクと感動を創造し続けます
          </p>
          <div className="value-words">
            <span>
              <Leaf size={13} />
              作る
            </span>
            <span>囲む</span>
            <span>残る</span>
          </div>
        </section>
        <div className="quick-links">
          <Link href="/plans">
            <Target size={18} />
            週次アクション
            <ArrowUpRight size={15} />
          </Link>
          <Link href="/library">
            <Check size={18} />
            必要な資料を探す
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </>
  );
}
