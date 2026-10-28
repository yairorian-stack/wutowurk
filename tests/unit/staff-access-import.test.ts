import { describe, expect, it } from "vitest";
import { parseStaffAccessGrid } from "../../src/lib/staff-access-import";

const header = [
  "メールアドレス",
  "氏名",
  "役職",
  "所属店舗",
  "権限",
  "閲覧範囲",
  "有効/無効",
];
const admin = [
  "OWNER@EXAMPLE.INVALID ",
  "架空 管理者",
  "総合責任者",
  "両店舗",
  "全社管理者",
  "両店舗",
  "有効",
];

describe("スタッフ権限台帳", () => {
  it("メールを正規化し店舗・権限・有効状態を安全な値へ変換する", () => {
    const rows = parseStaffAccessGrid([
      header,
      admin,
      [
        "staff@example.invalid",
        "架空 本店スタッフ",
        "社員",
        "本店",
        "一般スタッフ",
        "本店のみ",
        "無効",
      ],
    ]);
    expect(rows).toEqual([
      {
        email: "owner@example.invalid",
        display_name: "架空 管理者",
        job_title: "総合責任者",
        role: "company",
        store_id: null,
        enabled: true,
      },
      {
        email: "staff@example.invalid",
        display_name: "架空 本店スタッフ",
        job_title: "社員",
        role: "staff",
        store_id: "honten",
        enabled: false,
      },
    ]);
  });

  it("正規化後の重複メールや店舗範囲の不一致を全件拒否する", () => {
    expect(() =>
      parseStaffAccessGrid([header, admin, ["owner@example.invalid", ...admin.slice(1)]]),
    ).toThrow("SOURCE_VALIDATION_FAILED");
    expect(() =>
      parseStaffAccessGrid([
        header,
        admin,
        [
          "staff@example.invalid",
          "架空 スタッフ",
          "社員",
          "本店",
          "一般スタッフ",
          "羽ノ浦店のみ",
          "有効",
        ],
      ]),
    ).toThrow("SOURCE_VALIDATION_FAILED");
  });

  it("未知の権限値と管理者不在を拒否する", () => {
    expect(() =>
      parseStaffAccessGrid([header, [...admin.slice(0, 4), "スーパー管理者", ...admin.slice(5)]]),
    ).toThrow("SOURCE_VALIDATION_FAILED");
    expect(() =>
      parseStaffAccessGrid([
        header,
        [
          "staff@example.invalid",
          "架空 スタッフ",
          "社員",
          "本店",
          "一般スタッフ",
          "本店のみ",
          "有効",
        ],
      ]),
    ).toThrow("SOURCE_VALIDATION_FAILED");
  });
});
