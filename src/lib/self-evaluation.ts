export const assessmentDepartments = [
  {
    id: "kitchen",
    name: "調理部門",
    proposed: false,
    groups: [
      {
        name: "調理技術・商品品質",
        items: [
          "レシピと盛り付け基準を守れる",
          "食材の仕込みを正確に行える",
          "火入れ・味付けの品質を安定させられる",
          "提供スピードと調理順序を調整できる",
          "複数ポジションを担当できる",
        ],
      },
      {
        name: "衛生・原価・生産性",
        items: [
          "手洗い・温度管理・衛生基準を守れる",
          "食材の保管と先入れ先出しができる",
          "食品ロスと廃棄削減を意識している",
          "仕込み量と在庫量を適切に判断できる",
          "労働時間と生産性を意識して行動できる",
        ],
      },
      {
        name: "チームワーク・責任",
        items: [
          "報告・連絡・相談を適切に行える",
          "繁忙時に周囲を支援できる",
          "担当業務を最後まで遂行できる",
          "失敗や問題を隠さず共有できる",
          "接客部門と連携して仕事ができる",
        ],
      },
      {
        name: "成長・改善・理念",
        items: [
          "新しい調理技術を積極的に学んでいる",
          "後輩への技術共有や指導ができる",
          "作業効率の改善を提案している",
          "地元食材や商品への理解を深めている",
          "お客様の感動につながる料理を追求している",
        ],
      },
    ],
  },
  {
    id: "service",
    name: "接客部門",
    proposed: true,
    groups: [
      {
        name: "接客品質・お客様対応",
        items: [
          "明るい挨拶と丁寧な言葉遣いができる",
          "お客様の様子に合わせた気配りができる",
          "注文内容を正確に確認し伝達できる",
          "商品や地元食材の魅力を説明できる",
          "提供順序とタイミングを調整できる",
        ],
      },
      {
        name: "衛生・店舗運営・生産性",
        items: [
          "身だしなみ・手洗い・衛生基準を守れる",
          "客席・備品を清潔に整えられる",
          "会計と現金の取り扱いを正確に行える",
          "予約・配席・混雑状況を適切に共有できる",
          "労働時間と生産性を意識して行動できる",
        ],
      },
      {
        name: "チームワーク・責任",
        items: [
          "報告・連絡・相談を適切に行える",
          "繁忙時に周囲を支援できる",
          "担当業務を最後まで遂行できる",
          "失敗や問題を隠さず共有できる",
          "調理部門と連携して仕事ができる",
        ],
      },
      {
        name: "成長・改善・理念",
        items: [
          "接客の知識や技術を積極的に学んでいる",
          "後輩への接客手順の共有や指導ができる",
          "店舗の課題に気づき改善を提案している",
          "地域や生産者への理解を深めている",
          "お客様のワクワクと感動を生む接客を追求している",
        ],
      },
    ],
  },
  {
    id: "leader",
    name: "部門リーダー",
    proposed: true,
    groups: [
      {
        name: "方針共有・チーム運営",
        items: [
          "会社の理念と店舗目標を自分の言葉で伝えられる",
          "部門の役割と優先順位を明確にできる",
          "ミーティングで意見を引き出し行動につなげられる",
          "メンバーの状況を把握し適切に支援できる",
          "他部門と連携して店舗全体の運営を支えられる",
        ],
      },
      {
        name: "品質・衛生・数値管理",
        items: [
          "部門の品質・衛生基準を確認し改善できる",
          "売上・原価・食品ロスの状況を把握できる",
          "総労働時間と人時売上高を把握できる",
          "営業状況に合わせて人員配置と業務分担を調整できる",
          "問題発生時の報告と初動対応を適切に行える",
        ],
      },
      {
        name: "育成・公平な評価",
        items: [
          "メンバーに必要な業務を段階的に教えられる",
          "できたことと改善点を具体的に伝えられる",
          "メンバーの意見や困りごとを丁寧に聴ける",
          "評価基準に沿って行動事実を確認できる",
          "育成面談から次の行動目標につなげられる",
        ],
      },
      {
        name: "改善・挑戦・理念",
        items: [
          "部門の課題を整理し改善計画を立てられる",
          "改善の実行状況を振り返り継続できる",
          "地域や生産者の魅力を部門の仕事につなげられる",
          "メンバーの成長や挑戦の機会をつくれる",
          "人に良い行動を率先して実践できる",
        ],
      },
    ],
  },
] as const;

export type AssessmentDepartment = (typeof assessmentDepartments)[number]["id"];
export type AssessmentRating = 1 | 2 | 3 | 4 | 5 | "excluded" | null;
export type AssessmentDraft = {
  answers: AssessmentRating[];
  growth: string;
  improvement: string;
  goal: string;
};
export const assessmentRubric = [
  { value: 5, description: "他者に指導でき、安定して実践している" },
  { value: 4, description: "指示がなくても安定して実践できる" },
  { value: 3, description: "通常業務を自立して遂行できる" },
  { value: 2, description: "一部で指導や支援が必要" },
  { value: 1, description: "継続的な指導が必要" },
] as const;
export const assessmentBands = [
  {
    grade: "S",
    min: 90,
    range: "90〜100点",
    action: "昇格・昇給の優先候補として検討",
  },
  {
    grade: "A",
    min: 80,
    range: "80点以上90点未満",
    action: "昇給・上位業務への挑戦を検討",
  },
  {
    grade: "B",
    min: 70,
    range: "70点以上80点未満",
    action: "標準昇給・能力開発を検討",
  },
  {
    grade: "C",
    min: 60,
    range: "60点以上70点未満",
    action: "個別育成計画を検討",
  },
  { grade: "D", min: 0, range: "60点未満", action: "重点的な育成支援を検討" },
] as const;
export function createAssessmentDraft(): AssessmentDraft {
  return {
    answers: Array<AssessmentRating>(20).fill(null),
    growth: "",
    improvement: "",
    goal: "",
  };
}
export function summarizeAssessment(answers: readonly AssessmentRating[]) {
  if (
    answers.length !== 20 ||
    answers.some(
      (value) =>
        value !== null &&
        value !== "excluded" &&
        (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5),
    )
  )
    throw new Error("20項目を1〜5点・対象外・未回答で指定してください");
  const rated = answers.filter(
    (value): value is 1 | 2 | 3 | 4 | 5 => typeof value === "number",
  );
  const excluded = answers.filter((value) => value === "excluded").length;
  const answered = rated.length + excluded,
    unanswered = 20 - answered;
  const points = rated.reduce<number>((sum, value) => sum + value, 0);
  const score = rated.length ? (points * 100) / (rated.length * 5) : null;
  const band =
    !unanswered && rated.length
      ? assessmentBands.find((b) => points * 100 >= b.min * rated.length * 5)!
      : null;
  return {
    rated: rated.length,
    excluded,
    answered,
    unanswered,
    points,
    maxPoints: rated.length * 5,
    score,
    band,
    provisional: !!unanswered && !!rated.length,
  };
}
export function assessmentScoreText(score: number | null) {
  return score == null
    ? "未採点"
    : `${score.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}点`;
}
export function assessmentResultText(
  departmentId: AssessmentDepartment,
  identity: { name: string; storeName: string; period: string },
  draft: AssessmentDraft,
) {
  const department = assessmentDepartments.find((d) => d.id === departmentId)!;
  const s = summarizeAssessment(draft.answers);
  const lines = [
    "WUTO-WURK 自己評価シート（第1案）",
    `部門：${department.name}${department.proposed ? "（評価項目は検討案）" : ""}`,
    `氏名：${identity.name.trim() || "未記入"}`,
    `勤務店舗：${identity.storeName}`,
    `評価対象期間：${identity.period.trim() || "未記入"}`,
    `自己評価：${assessmentScoreText(s.score)}${s.provisional ? "（暫定・100点換算）" : s.score == null ? "" : "（100点換算）"}`,
    `回答：${s.answered}/20項目（採点${s.rated}・対象外${s.excluded}・未回答${s.unanswered}）`,
    `自己評価の区分目安：${s.band?.grade ?? "未確定"}`,
    "",
  ];
  department.groups.forEach((group, groupIndex) => {
    lines.push(`${groupIndex + 1}. ${group.name}`);
    group.items.forEach((item, itemIndex) => {
      const index = groupIndex * 5 + itemIndex,
        value = draft.answers[index];
      lines.push(
        `${index + 1}. ${item}：${value === "excluded" ? "対象外" : value == null ? "未回答" : `${value}点`}`,
      );
    });
    lines.push("");
  });
  lines.push(
    "振り返り・次の目標",
    `自分が成長したこと・強み：${draft.growth.trim() || "未記入"}`,
    `今後改善したいこと：${draft.improvement.trim() || "未記入"}`,
    `次回評価までの行動目標：${draft.goal.trim() || "未記入"}`,
    "",
    "点数は本人の自己評価です。上司評価との比較・面談を経て最終評価を決定します。昇格・昇給を保証するものではありません。",
    "調理・接客・部門リーダーの同じ点数は、能力が同等であることを意味しません。",
  );
  return lines.join("\n");
}
