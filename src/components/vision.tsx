"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Compass,
  Flag,
  Globe2,
  Pencil,
  Sprout,
} from "lucide-react";
import {
  isGlobal,
  saveVision,
  today,
  type PortalState,
  type Vision,
} from "@/lib/domain";
import { updatePortal } from "@/lib/store";
import { Dialog } from "./dialog";
import { BrandArt } from "./brand-art";

export function VisionMap({
  state,
  notify,
}: {
  state: PortalState;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(state.visions[0]?.id);
  const [editing, setEditing] = useState<Vision | null>(null);
  const phase =
    state.visions.find((v) => v.id === selected) ?? state.visions[0];
  const phases = [...state.visions].sort((a, b) => a.start - b.start);
  const year = Number(today().slice(0, 4));
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">FROM ANAN TO THE WORLD.</p>
          <h1>2046年ビジョンマップ</h1>
          <p className="muted">今日の一歩と、20年後の未来をつなぐ。</p>
        </div>
        <span className="outline-badge">
          <Globe2 size={16} />
          世界10カ国へ
        </span>
      </div>
      <section className="vision-banner vision-page-banner">
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
            世界10カ国で、その地域の人々から
            <br />
            必要とされる飲食ブランドになる。
          </p>
        </div>
        <BrandArt />
        <div className="vision-number">
          <strong>10</strong>
          <span>COUNTRIES / 2046</span>
        </div>
      </section>
      <div className="roadmap-intro">
        <Compass size={20} />
        <p>
          未来から逆算する、私たちの道のり。
          <span>期間を選ぶと、目標と次の一歩が見えます。</span>
        </p>
      </div>
      <div className="roadmap-layout">
        <nav className="roadmap" aria-label="ビジョンの期間">
          {phases.map((v, i) => (
            <button
              key={v.id}
              className={`roadmap-stop ${phase.id === v.id ? "selected" : ""}`}
              onClick={() => setSelected(v.id)}
              aria-pressed={phase.id === v.id}
            >
              <span className="roadmap-dot">
                {i === phases.length - 1 ? (
                  <Flag size={15} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>
                <span className="roadmap-years">
                  {v.start} — {v.end}
                  {year >= v.start && year <= v.end && (
                    <span className="now-tag">いま、ここ</span>
                  )}
                </span>
                <strong>{v.title}</strong>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </nav>
        <section className="panel phase-detail" key={phase.id}>
          <div className="phase-heading">
            <div>
              <p className="eyebrow">
                {phase.start} — {phase.end} / OUR NEXT STEP
              </p>
              <h2>{phase.title}</h2>
            </div>
            {isGlobal(state.session.role) && (
              <button
                className="icon-button"
                onClick={() => setEditing(phase)}
                aria-label="この期間を編集"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
          <p className="phase-statement">{phase.state}</p>
          <div className="country-goal">
            <Globe2 size={22} />
            <span>目指す展開規模</span>
            <strong>
              {phase.countries}
              <small>カ国</small>
            </strong>
          </div>
          <dl className="phase-fields">
            {(
              [
                ["goal", "達成すべき目標"],
                ["action", "必要な行動"],
                ["metric", "成果指標"],
                ["gate", "次の段階へ進む条件"],
              ] as const
            ).map(([key, label], i) => (
              <div key={key}>
                <dt>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </dt>
                <dd>{phase[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="sample-footnote">
            <Sprout size={14} />
            詳細の行動・指標・移行条件は、検討用のサンプルです。
          </p>
        </section>
      </div>
      <section className="vision-values">
        <p className="eyebrow">THE VALUE OF OUR FOOD EXPERIENCE</p>
        <h2>作る・囲む・残る</h2>
        <div>
          <article>
            <span>01 / 作る</span>
            <h3>土地の魅力を、一皿に。</h3>
            <p>
              生産者の想いと食材の個性を、
              <br />
              私たちの手で届ける。
            </p>
          </article>
          <article>
            <span>02 / 囲む</span>
            <h3>食卓に、心の温もりを。</h3>
            <p>
              大切な人と囲む時間が、
              <br />
              人と地域をつないでいく。
            </p>
          </article>
          <article>
            <span>03 / 残る</span>
            <h3>また訪れたい、記憶に。</h3>
            <p>
              食べた後も心に残る体験が、
              <br />
              その土地を好きになるきっかけに。
            </p>
          </article>
        </div>
        <p className="muted small">
          上記の価値の説明文は、試作品での表現案です。
        </p>
      </section>
      {editing && (
        <VisionEditor
          vision={editing}
          close={() => setEditing(null)}
          notify={notify}
        />
      )}
    </>
  );
}
function VisionEditor({
  vision,
  close,
  notify,
}: {
  vision: Vision;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [form, setForm] = useState(vision);
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      updatePortal((s) => saveVision(s, form));
      notify("ビジョンを保存しました");
      close();
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "年・目標・各項目の入力内容を確認してください",
      );
    }
  }
  return (
    <Dialog
      title="ビジョンの期間を編集"
      subtitle="変更はこのブラウザー内の試作品に保存されます。"
      close={close}
      wide
    >
      <form className="editor-form" onSubmit={submit}>
        <div className="form-row">
          <label>
            開始年
            <input
              required
              type="number"
              min={2026}
              max={2100}
              value={form.start}
              onChange={(e) =>
                setForm({ ...form, start: Number(e.target.value) })
              }
            />
          </label>
          <label>
            終了年
            <input
              required
              type="number"
              min={form.start}
              max={2100}
              value={form.end}
              onChange={(e) =>
                setForm({ ...form, end: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label>
          期間の目標
          <input
            required
            maxLength={80}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          目指す展開国数
          <input
            required
            type="number"
            min={1}
            max={100}
            value={form.countries}
            onChange={(e) =>
              setForm({ ...form, countries: Number(e.target.value) })
            }
          />
        </label>
        {(
          [
            ["state", "目指す状態"],
            ["goal", "達成すべき目標"],
            ["action", "必要な行動"],
            ["metric", "成果指標"],
            ["gate", "次の段階へ進む条件"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              required
              maxLength={600}
              rows={2}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            キャンセル
          </button>
          <button className="button primary" type="submit">
            <Check size={17} />
            変更を保存
          </button>
        </div>
      </form>
    </Dialog>
  );
}
