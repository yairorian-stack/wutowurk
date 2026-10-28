"use client";
import { useState } from "react";
import { Check, ClipboardCopy, Info, Printer, Sprout } from "lucide-react";
import { stores, type StoreId } from "@/lib/domain";
import {
  assessmentDepartments,
  assessmentRubric,
  assessmentBands,
  assessmentResultText,
  assessmentScoreText,
  createAssessmentDraft,
  summarizeAssessment,
  type AssessmentDepartment,
  type AssessmentDraft,
  type AssessmentRating,
} from "@/lib/self-evaluation";

export function SelfEvaluation({
  initialStoreId,
}: {
  initialStoreId: StoreId;
}) {
  const [departmentId, setDepartmentId] =
    useState<AssessmentDepartment>("kitchen");
  const [drafts, setDrafts] = useState<
    Record<AssessmentDepartment, AssessmentDraft>
  >(() => ({
    kitchen: createAssessmentDraft(),
    service: createAssessmentDraft(),
    leader: createAssessmentDraft(),
  }));
  const [identity, setIdentity] = useState({
    name: "",
    storeId: initialStoreId,
    period: "",
  });
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const department = assessmentDepartments.find((d) => d.id === departmentId)!;
  const draft = drafts[departmentId],
    summary = summarizeAssessment(draft.answers);
  function answer(index: number, value: AssessmentRating) {
    setDrafts((prev) => ({
      ...prev,
      [departmentId]: {
        ...prev[departmentId],
        answers: prev[departmentId].answers.map((old, i) =>
          i === index ? value : old,
        ),
      },
    }));
  }
  function reflect(key: "growth" | "improvement" | "goal", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [departmentId]: { ...prev[departmentId], [key]: value },
    }));
  }
  async function copy() {
    const text = assessmentResultText(
      departmentId,
      {
        ...identity,
        storeName: stores.find((s) => s.id === identity.storeId)!.name,
      },
      draft,
    );
    setCopying(true);
    setNotice("");
    setManualCopy("");
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setNotice(
        "評価結果をコピーしました。貼り付け先の共有範囲を確認してください。",
      );
    } catch {
      setManualCopy(text);
      setNotice(
        "自動コピーを利用できません。下の結果を選択してコピーしてください。",
      );
    } finally {
      setCopying(false);
    }
  }
  function print() {
    try {
      window.print();
    } catch {
      setNotice(
        "印刷画面を開けませんでした。評価結果のコピーをご利用ください。",
      );
    }
  }
  return (
    <article className="self-evaluation-page">
      <p className="evaluation-print-only evaluation-print-brand">
        WUTO-WURK スタッフ成長支援ポータル
      </p>
      <div className="page-intro evaluation-intro">
        <div>
          <p className="eyebrow">GROWTH STARTS WITH REFLECTION.</p>
          <h1>
            自己評価シート <span>第1案</span>
          </h1>
          <p className="muted">
            できるようになったことを見つけて、次の一歩へ。
          </p>
        </div>
        <Sprout size={33} />
      </div>
      <div className="evaluation-privacy-note evaluation-screen-only">
        <Info size={21} />
        <p>
          入力内容はこの画面内だけで扱い、送信・自動保存しません。ページの再読み込み・移動で消えるため、必要な結果はコピーまたは印刷して保管してください。
        </p>
      </div>
      <div
        className="evaluation-departments evaluation-screen-only"
        role="group"
        aria-label="評価する部門"
      >
        {assessmentDepartments.map((d) => (
          <button
            type="button"
            key={d.id}
            aria-pressed={departmentId === d.id}
            onClick={() => {
              setDepartmentId(d.id);
              setNotice("");
              setManualCopy("");
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
      <p className="evaluation-sheet-heading">
        <strong>{department.name}</strong>
        <span>
          {department.proposed
            ? "評価項目は検討案です。運用前に内容を確認してください。"
            : "20項目 × 5点 / 100点満点"}
        </span>
      </p>
      <form onSubmit={(e) => e.preventDefault()} autoComplete="off">
        <div className="panel evaluation-identity">
          <label>
            氏名（任意）
            <input
              className="evaluation-screen-only"
              aria-label="自己評価の氏名"
              autoComplete="off"
              maxLength={80}
              value={identity.name}
              onChange={(e) =>
                setIdentity({ ...identity, name: e.target.value })
              }
            />
            <span className="evaluation-print-only">
              {identity.name || "未記入"}
            </span>
          </label>
          <label>
            勤務店舗
            <select
              className="evaluation-screen-only"
              aria-label="自己評価の勤務店舗"
              value={identity.storeId}
              onChange={(e) =>
                setIdentity({ ...identity, storeId: e.target.value as StoreId })
              }
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="evaluation-print-only">
              {stores.find((s) => s.id === identity.storeId)!.name}
            </span>
          </label>
          <label>
            評価対象期間（任意）
            <input
              className="evaluation-screen-only"
              aria-label="自己評価の対象期間"
              maxLength={80}
              placeholder="例：39期 前期"
              value={identity.period}
              onChange={(e) =>
                setIdentity({ ...identity, period: e.target.value })
              }
            />
            <span className="evaluation-print-only">
              {identity.period || "未記入"}
            </span>
          </label>
        </div>
        <section
          className="panel evaluation-summary"
          aria-label="現在の自己評価"
          aria-live="polite"
          aria-atomic="true"
        >
          <div>
            <p>現在の自己評価{summary.provisional ? "（暫定点）" : ""}</p>
            <strong className="evaluation-score">
              {assessmentScoreText(summary.score)}
              {summary.score != null && <small> / 100</small>}
            </strong>
            {summary.band && (
              <span className="evaluation-band">
                自己評価の区分目安 {summary.band.grade}
              </span>
            )}
          </div>
          <div className="evaluation-answer-status">
            <strong>{summary.answered} / 20項目回答</strong>
            <p>
              採点 {summary.rated}・対象外 {summary.excluded}・未回答{" "}
              {summary.unanswered}
            </p>
            <div
              role="progressbar"
              aria-label="自己評価の回答進捗"
              aria-valuemin={0}
              aria-valuemax={20}
              aria-valuenow={summary.answered}
              className="evaluation-progress"
            >
              <span style={{ width: `${summary.answered * 5}%` }} />
            </div>
          </div>
          <p className="evaluation-score-note">
            {summary.rated
              ? `採点済み ${summary.points}/${summary.maxPoints} 点を100点換算しています。${summary.provisional ? "未回答が残っているため、区分目安は未確定です。" : "本人による自己評価の目安です。"}`
              : summary.excluded === 20
                ? "全項目が対象外のため、点数・区分は算出しません。"
                : "回答済みの採点項目だけで100点換算します。対象外は集計しません。"}
          </p>
        </section>
        <details className="panel evaluation-rubric evaluation-screen-only">
          <summary>1〜5点の判断基準を確認する</summary>
          <dl>
            {assessmentRubric.map((r) => (
              <div key={r.value}>
                <dt>{r.value}点</dt>
                <dd>{r.description}</dd>
              </div>
            ))}
          </dl>
          <p>
            未経験・担当外の業務は「対象外」を選びます。採点しない項目を1点で埋める必要はありません。
          </p>
        </details>
        {department.groups.map((group, groupIndex) => {
          const groupAnswers = draft.answers
            .slice(groupIndex * 5, groupIndex * 5 + 5)
            .filter((a) => a != null).length;
          return (
            <section
              className="panel evaluation-group"
              key={group.name}
              aria-labelledby={`evaluation-group-${departmentId}-${groupIndex}`}
            >
              <div className="evaluation-group-heading">
                <h2 id={`evaluation-group-${departmentId}-${groupIndex}`}>
                  {groupIndex + 1}. {group.name}
                </h2>
                <span>{groupAnswers}/5回答</span>
              </div>
              {group.items.map((item, itemIndex) => {
                const index = groupIndex * 5 + itemIndex,
                  value = draft.answers[index];
                return (
                  <fieldset
                    className="evaluation-item"
                    key={`${departmentId}-${index}`}
                  >
                    <legend>
                      {index + 1}. {item}
                    </legend>
                    <div className="evaluation-rating-options evaluation-screen-only">
                      {([1, 2, 3, 4, 5, "excluded"] as const).map((rating) => (
                        <label
                          className={value === rating ? "selected" : ""}
                          key={rating}
                        >
                          <input
                            type="radio"
                            name={`evaluation-${departmentId}-${index}`}
                            checked={value === rating}
                            aria-label={
                              rating === "excluded" ? "対象外" : `${rating}点`
                            }
                            onChange={() => answer(index, rating)}
                          />
                          <span>
                            {rating === "excluded" ? "対象外" : rating}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="evaluation-print-only evaluation-printed-answer">
                      {value === "excluded"
                        ? "対象外"
                        : value == null
                          ? "未回答"
                          : `${value}点`}
                    </p>
                    {value != null && (
                      <button
                        type="button"
                        className="text-button evaluation-clear-answer evaluation-screen-only"
                        aria-label={`項目${index + 1}の回答を取り消す`}
                        onClick={() => answer(index, null)}
                      >
                        未回答に戻す
                      </button>
                    )}
                  </fieldset>
                );
              })}
            </section>
          );
        })}
        <section className="panel evaluation-reflections">
          <h2>振り返り・次の目標</h2>
          {(
            [
              ["growth", "自分が成長したこと・強み"],
              ["improvement", "今後改善したいこと"],
              ["goal", "次回評価までの行動目標"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                aria-label={label}
                className="evaluation-screen-only"
                rows={4}
                maxLength={1600}
                value={draft[key]}
                onChange={(e) => reflect(key, e.target.value)}
              />
              <span className="evaluation-print-only evaluation-reflection-text">
                {draft[key] || "未記入"}
              </span>
            </label>
          ))}
        </section>
        <div className="panel evaluation-export evaluation-screen-only">
          <div>
            <strong>
              回答 {summary.answered}/20項目 ·{" "}
              {assessmentScoreText(summary.score)}
              {summary.provisional ? "（暫定）" : ""}
            </strong>
            <p>
              コピー・印刷は、現在選択している「{department.name}
              」の内容です。印刷画面からPDFとして保存できます。
            </p>
          </div>
          <div className="evaluation-export-actions">
            <button
              type="button"
              className="button primary"
              disabled={copying}
              onClick={copy}
            >
              <ClipboardCopy size={17} />
              {copying ? "コピー中…" : "評価結果をコピー"}
            </button>
            <button type="button" className="button secondary" onClick={print}>
              <Printer size={17} />
              印刷・PDF保存
            </button>
          </div>
          {notice && (
            <p className="evaluation-feedback" role="status">
              <Check size={17} />
              {notice}
            </p>
          )}
          {manualCopy && (
            <label className="evaluation-manual-copy">
              コピー用の評価結果
              <textarea
                aria-label="コピー用の評価結果"
                readOnly
                rows={12}
                value={manualCopy}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          )}
        </div>
      </form>
      <section className="panel evaluation-policy">
        <p className="eyebrow">GROWTH & NEXT STEPS</p>
        <h2>
          人事評価と昇給へのつなげ方 <span>制度案</span>
        </h2>
        <p>
          自己評価と上司評価を比較し、面談を経て最終評価を決定します。自己評価の点数だけで給与は決めません。昇格・昇給を保証するものではありません。
        </p>
        <div className="evaluation-policy-table-wrap">
          <table>
            <caption>100点換算した自己評価の区分と、対応の検討目安</caption>
            <thead>
              <tr>
                <th>評価</th>
                <th>点数</th>
                <th>対応の検討目安</th>
              </tr>
            </thead>
            <tbody>
              {assessmentBands.map((b) => (
                <tr key={b.grade}>
                  <th scope="row">{b.grade}</th>
                  <td>{b.range}</td>
                  <td>{b.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          調理・接客・部門リーダーは仕事の難易度が異なるため、同じ80点でも能力が同等という意味にはなりません。
        </p>
      </section>
      <section className="panel evaluation-schedule">
        <h2>39期の運用案</h2>
        <p>
          半年ごとに自己評価・上司評価と育成面談を行い、昇給査定は原則年1回とする案です。
        </p>
        <ol>
          <li>
            <strong>1月</strong>
            <span>自己評価・上司評価・育成面談</span>
          </li>
          <li>
            <strong>4月</strong>
            <span>昇給・昇格の実施を検討</span>
          </li>
          <li>
            <strong>7月</strong>
            <span>半期評価・育成面談・次期目標設定</span>
          </li>
        </ol>
        <p className="evaluation-policy-note">
          本シート・区分・運用時期は第1案です。制度の確定内容は会社からの正式な案内で確認してください。
        </p>
      </section>
    </article>
  );
}
