import { describe, expect, it } from "vitest";
import {
  assessmentDepartments,
  assessmentResultText,
  createAssessmentDraft,
  summarizeAssessment,
  type AssessmentRating,
} from "../../src/lib/self-evaluation";

describe("自己評価の採点", () => {
  it("3部門とも4分類・20項目で、調理部門の指定項目を含む", () => {
    expect(assessmentDepartments).toHaveLength(3);
    for (const department of assessmentDepartments) {
      expect(department.groups).toHaveLength(4);
      expect(department.groups.flatMap((g) => g.items)).toHaveLength(20);
      expect(department.groups.every((g) => g.items.length === 5)).toBe(true);
    }
    expect(assessmentDepartments[0].groups[0].items[0]).toBe(
      "レシピと盛り付け基準を守れる",
    );
    expect(assessmentDepartments[0].groups[3].items[4]).toBe(
      "お客様の感動につながる料理を追求している",
    );
    expect(assessmentDepartments.slice(1).every((d) => d.proposed)).toBe(true);
  });
  it("未回答を0点とせず、未採点とする", () => {
    const s = summarizeAssessment(createAssessmentDraft().answers);
    expect(s.score).toBeNull();
    expect(s.band).toBeNull();
    expect(s.answered).toBe(0);
    expect(s.unanswered).toBe(20);
  });
  it("全項目対象外は回答済みでも点数・区分を算出しない", () => {
    const s = summarizeAssessment(Array<AssessmentRating>(20).fill("excluded"));
    expect(s.answered).toBe(20);
    expect(s.excluded).toBe(20);
    expect(s.rated).toBe(0);
    expect(s.score).toBeNull();
    expect(s.band).toBeNull();
  });
  it("1項目5点は暫定100点で、S区分を確定しない", () => {
    const draft = createAssessmentDraft();
    draft.answers[0] = 5;
    const s = summarizeAssessment(draft.answers);
    expect(s.score).toBe(100);
    expect(s.provisional).toBe(true);
    expect(s.band).toBeNull();
    expect(s.unanswered).toBe(19);
  });
  it("対象外を分母から外し、評価可能項目で100点換算する", () => {
    const answers = Array<AssessmentRating>(20).fill("excluded");
    answers[0] = 4;
    answers[1] = 5;
    const s = summarizeAssessment(answers);
    expect(s.points).toBe(9);
    expect(s.maxPoints).toBe(10);
    expect(s.score).toBe(90);
    expect(s.band?.grade).toBe("S");
    expect(s.provisional).toBe(false);
  });
  it.each([
    [100, "S"],
    [90, "S"],
    [89, "A"],
    [80, "A"],
    [79, "B"],
    [70, "B"],
    [69, "C"],
    [60, "C"],
    [59, "D"],
    [20, "D"],
  ] as const)("%d点の区分は%s", (points, grade) => {
    const answers: AssessmentRating[] = Array(20).fill(5);
    let subtract = 100 - points;
    for (let i = 0; i < answers.length; i++) {
      const diff = Math.min(4, subtract);
      answers[i] = (5 - diff) as AssessmentRating;
      subtract -= diff;
    }
    const s = summarizeAssessment(answers);
    expect(s.score).toBe(points);
    expect(s.band?.grade).toBe(grade);
  });
  it("1項目だけを採点しても未回答と対象外で進捗を区別する", () => {
    const answers = createAssessmentDraft().answers;
    answers[0] = 3;
    answers[1] = "excluded";
    const s = summarizeAssessment(answers);
    expect(s.answered).toBe(2);
    expect(s.rated).toBe(1);
    expect(s.excluded).toBe(1);
    expect(s.unanswered).toBe(18);
    expect(s.score).toBe(60);
  });
  it("不正な点数・項目数を拒否する", () => {
    expect(() => summarizeAssessment([])).toThrow();
    for (const invalid of [0, 6, 1.5])
      expect(() =>
        summarizeAssessment([
          invalid,
          ...Array(19).fill(null),
        ] as AssessmentRating[]),
      ).toThrow();
  });
  it("コピー結果は未回答・対象外・暫定と本人の次の目標を保持する", () => {
    const draft = createAssessmentDraft();
    draft.answers[0] = 5;
    draft.answers[1] = "excluded";
    draft.goal = "架空の次回目標";
    const text = assessmentResultText(
      "kitchen",
      { name: "", storeName: "WUTO-WURK 本店", period: "39期 前期" },
      draft,
    );
    expect(text).toContain("氏名：未記入");
    expect(text).toContain("（暫定・100点換算）");
    expect(text).toContain("自己評価の区分目安：未確定");
    expect(text).toContain("2. 食材の仕込みを正確に行える：対象外");
    expect(text).toContain("3. 火入れ・味付けの品質を安定させられる：未回答");
    expect(text).toContain(draft.goal);
    expect(text).toContain("昇格・昇給を保証するものではありません");
  });
});
