"use client";

import { useState, type FormEvent } from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import {
  addDays,
  saveGoal,
  statuses,
  stores,
  weekStart,
  type Goal,
  type GoalInput,
  type StoreId,
} from "@/lib/domain";
import { updatePortal } from "@/lib/store";
import { Dialog } from "./dialog";

export function GoalEditor({
  goal,
  storeId,
  week,
  close,
  saved,
}: {
  goal?: Goal;
  storeId: StoreId;
  week: string;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<GoalInput>(
    goal ?? {
      storeId,
      week,
      title: "",
      action: "",
      assignee: "",
      due: addDays(week, 6),
      status: "未着手",
      outcome: "",
      reflection: "",
      nextStep: "",
    },
  );
  const [error, setError] = useState("");
  function field<K extends keyof GoalInput>(key: K, value: GoalInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      updatePortal((s) => saveGoal(s, form, goal?.id));
      saved();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <Dialog
      title={goal ? "今週の目標を編集" : "今週の目標をつくる"}
      subtitle="小さく、具体的に。今週の一歩を決めましょう。"
      close={close}
      wide
    >
      <form onSubmit={submit} className="editor-form">
        <div className="info-note">
          <Info size={17} />
          <span>
            サンプル専用です。実名・個人情報・社内機密は入力しないでください。
          </span>
        </div>
        <div className="form-row">
          <label>
            所属店舗
            <select
              value={form.storeId}
              disabled
              onChange={(e) => field("storeId", e.target.value as StoreId)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            対象週（月曜日）
            <input
              type="date"
              required
              disabled={!!goal}
              value={form.week}
              onChange={(e) => {
                if (e.target.value) {
                  const next = weekStart(e.target.value);
                  setForm((p) => ({ ...p, week: next, due: addDays(next, 6) }));
                }
              }}
            />
          </label>
        </div>
        <label>
          今週の目標 <span className="required">必須</span>
          <input
            autoComplete="off"
            required
            maxLength={100}
            placeholder="例：地元食材の魅力を、一言添えて届ける"
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label>
          具体的な行動 <span className="required">必須</span>
          <textarea
            required
            maxLength={600}
            rows={3}
            placeholder="何を、どのように行いますか？"
            value={form.action}
            onChange={(e) => field("action", e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            担当者 <span className="required">必須</span>
            <input
              required
              maxLength={50}
              placeholder="例：ホール担当A（架空名）"
              value={form.assignee}
              onChange={(e) => field("assignee", e.target.value)}
            />
          </label>
          <label>
            期限
            <input
              type="date"
              required
              min={form.week}
              max={addDays(form.week, 6)}
              value={form.due}
              onChange={(e) => field("due", e.target.value)}
            />
          </label>
        </div>
        <label>
          達成状況
          <select
            aria-label="達成状況"
            value={form.status}
            onChange={(e) => field("status", e.target.value as Goal["status"])}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <details
          open={
            goal && (goal.status === "完了" || !!goal.outcome)
              ? true
              : undefined
          }
          className="reflection-fields"
        >
          <summary>
            成果・振り返りを記録する <ChevronDown size={16} />
          </summary>
          <div className="reflection-content">
            <label>
              成果
              <textarea
                rows={2}
                maxLength={800}
                placeholder="実際に起きた変化は？"
                value={form.outcome}
                onChange={(e) => field("outcome", e.target.value)}
              />
            </label>
            <label>
              振り返り
              <textarea
                rows={2}
                maxLength={800}
                placeholder="良かった点、改善したい点"
                value={form.reflection}
                onChange={(e) => field("reflection", e.target.value)}
              />
            </label>
            <label>
              次週への課題
              <textarea
                rows={2}
                maxLength={800}
                placeholder="来週も続けたいこと"
                value={form.nextStep}
                onChange={(e) => field("nextStep", e.target.value)}
              />
            </label>
          </div>
        </details>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            キャンセル
          </button>
          <button type="submit" className="button primary">
            <Check size={17} />
            目標を保存
          </button>
        </div>
      </form>
    </Dialog>
  );
}
