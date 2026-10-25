import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { novemberGarbageFixture } from "../../src/lib/garbage";
const coreSource = readFileSync("automation/garbage/Core.gs", "utf8");
const runtimeSource = readFileSync("automation/garbage/Runtime.gs", "utf8");
const fixture = {
  body: "令和8年11月 ごみ収集予定表",
  tables: [
    [
      [
        "地区番号",
        "地区名",
        "プラ容器包装",
        "カン",
        "ペットボトル",
        "ビン",
        "不燃・粗大",
        "古紙",
      ],
      ["17", "別地区", "1", "2", "3", "4", "5", "6"],
      [
        "18",
        "福井・後戸・鵠",
        "6(金)・17(火)",
        "13(金)",
        "24(火)",
        "25(水)",
        "27(金)",
        "1・8・15",
      ],
    ],
  ],
};
function core() {
  const context = vm.createContext({});
  vm.runInContext(coreSource, context);
  return (code: string) =>
    JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context));
}
function runtime(iso = "2026-11-05T08:00:30Z", fail = false) {
  const props = new Map<string, string>([
    ["WWG_ENABLED", "true"],
    ["WWG_SOURCE_HEALTH", "ready"],
    [
      "WWG_APPROVED_LAYOUT",
      createHash("sha256").update("layout").digest("hex"),
    ],
    [
      "WWG_MONTH_2026-11",
      JSON.stringify({
        month: "2026-11",
        layout: "layout",
        fetchedAt: iso,
        events: novemberGarbageFixture,
        pdfUrl: "https://www.city.anan.tokushima.jp/example.pdf",
      }),
    ],
    ["WWG_EMAILS_JA", '["ja@example.invalid"]'],
    ["WWG_EMAILS_VI", '["vi1@example.invalid","vi2@example.invalid"]'],
    ["WWG_LINE_TOKEN_PROPERTY", "EXISTING_TOKEN"],
    ["WWG_LINE_GROUP_PROPERTY", "EXISTING_GROUP"],
    ["EXISTING_TOKEN", "TEST_ONLY_NOT_A_REAL_TOKEN"],
    ["EXISTING_GROUP", "C" + "a".repeat(32)],
  ]);
  const sent: string[] = [],
    audit: string[][] = [];
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => props.set(k, v),
        deleteProperty: (k: string) => props.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_: string, text: string) => [
        ...createHash("sha256").update(text).digest(),
      ],
    },
    MailApp: {
      sendEmail: (_: string, __: string, body: string) => {
        sent.push(body);
        if (fail) throw new Error("UNKNOWN_NETWORK_RESULT");
      },
    },
    UrlFetchApp: {
      fetch: (_: string, options: { payload: string }) => {
        sent.push(options.payload);
        return { getResponseCode: () => 200 };
      },
    },
    testAudit: audit,
    console,
  });
  vm.runInContext(
    `var FixedOriginalDate=Date; Date=class extends FixedOriginalDate { constructor(...args) { super(...(args.length ? args : [${JSON.stringify(iso)}])); } static now() {return new FixedOriginalDate(${JSON.stringify(iso)}).getTime();} };`,
    context,
  );
  vm.runInContext(coreSource + "\n" + runtimeSource, context);
  vm.runInContext(
    "wwgAudit_=function(event,key,status,late,details){testAudit.push([event,key,status,String(late),String(details)]);};",
    context,
  );
  return {
    sent,
    props,
    audit,
    tick: () => vm.runInContext("wwGarbageTick()", context),
  };
}
describe("18番地区の収集日と前日通知", () => {
  it("提供された11月の7品目日程を6収集日・12通知枠にまとめ、古紙や別地区を除外", () => {
    const run = core(),
      parsed = run(`WWGarbageCore.extract(${JSON.stringify(fixture)})`);
    expect(parsed.events).toEqual(novemberGarbageFixture);
    const slots = run(
      `WWGarbageCore.extract(${JSON.stringify(fixture)}).events.flatMap(WWGarbageCore.slots)`,
    );
    expect(slots).toHaveLength(12);
    expect(slots[0]).toMatchObject({
      local: "2026-11-05T17:00:00+09:00",
      utc: "2026-11-05T08:00:00.000Z",
    });
    expect(slots.at(-1)).toMatchObject({
      local: "2026-11-26T19:00:00+09:00",
      categories: ["nonburn", "bulky"],
    });
  });
  it("本文の年月を検証し、曖昧な年月・未確認の表構造・空欄・不正曜日を拒否", () => {
    const run = core();
    for (const body of ["2026年10月 2026年11月", "2026年13月", "年月なし"])
      expect(() =>
        run(`WWGarbageCore.monthFromBody(${JSON.stringify(body)})`),
      ).toThrow();
    for (const day of ["", "31日", "6(土)", "6〜17", "毎週金曜日"])
      expect(() =>
        run(`WWGarbageCore.datesInCell(${JSON.stringify(day)},"2026-11")`),
      ).toThrow();
    const changed = structuredClone(fixture);
    changed.tables[0][0][2] = "未知の品目";
    expect(() =>
      run(`WWGarbageCore.extract(${JSON.stringify(changed)})`),
    ).toThrow();
  });
  it("月またぎ・年またぎと5分の許容窓を日本時間で計算する（10月は合成境界テスト）", () => {
    const run = core();
    expect(
      run('WWGarbageCore.slots({date:"2026-10-01",categories:["plastic"]})')[0]
        .local,
    ).toBe("2026-09-30T17:00:00+09:00");
    expect(
      run('WWGarbageCore.slots({date:"2027-01-01",categories:["plastic"]})')[0]
        .local,
    ).toBe("2026-12-31T17:00:00+09:00");
    for (const [now, expected] of [
      ["07:59:59", "future"],
      ["08:00:00", "due"],
      ["08:04:59", "due"],
      ["08:05:00", "missed"],
    ])
      expect(
        run(
          `WWGarbageCore.timing({utc:"2026-11-05T08:00:00Z"},"2026-11-05T${now}Z")`,
        ).state,
      ).toBe(expected);
  });
  it("公式リンクを探索し、外部PDFへ逸れない。日程はファイル名から決めない", () => {
    const run = core();
    expect(
      run(
        "WWGarbageCore.discoverLinks('<a href=\"/docs/attach/unknown.pdf\">予定表</a>')",
      ),
    ).toEqual(["https://www.city.anan.tokushima.jp/docs/attach/unknown.pdf"]);
    expect(() =>
      run(
        "WWGarbageCore.discoverLinks('<a href=\"https://evil.example/a.pdf\">予定表</a>')",
      ),
    ).toThrow();
  });
  it("日本語・ベトナム語に日付・曜日・分別・朝8時・公式リンクを含める", () => {
    const run = core(),
      event = JSON.stringify(novemberGarbageFixture.at(-1));
    const ja = run(`WWGarbageCore.message(${event},"ja")`),
      vi = run(`WWGarbageCore.message(${event},"vi")`);
    expect(ja).toContain("2026-11-27（金）");
    expect(ja).toContain("不燃");
    expect(ja).toContain("粗大");
    expect(ja).toContain("朝8時");
    expect(vi).toContain("Thứ Sáu");
    expect(vi).toContain("trước 8 giờ");
    expect(vi).toContain("https://www.city.anan.tokushima.jp/");
  });
});
describe("GAS通知処理（全外部サービスをモック）", () => {
  it("3メールとLINEを各1回送信し、再実行でも重複しない", () => {
    const system = runtime();
    system.tick();
    system.tick();
    expect(system.sent).toHaveLength(4);
    expect(system.audit.filter((r) => r[2] === "SENT")).toHaveLength(4);
    expect(
      system.audit.filter((r) => r[2] === "SENT").every((r) => r[3] === "30"),
    ).toBe(true);
  });
  it("送信結果不明で自動再送せず、管理者確認待ちの記録を残す", () => {
    const system = runtime(undefined, true);
    system.tick();
    system.tick();
    expect(system.sent).toHaveLength(4);
    expect(
      [...system.props.values()].filter((v) => v.includes('"state":"UNKNOWN"')),
    ).toHaveLength(3);
  });
  it("指定時刻を過ぎた場合・取得失敗・停止中は収集通知しない", () => {
    const missed = runtime("2026-11-05T08:05:00Z");
    missed.tick();
    expect(missed.sent).toHaveLength(0);
    expect(missed.audit.some((r) => r[2] === "MISSED")).toBe(true);
    const blocked = runtime();
    blocked.props.set("WWG_SOURCE_HEALTH", "blocked");
    blocked.tick();
    expect(blocked.sent).toHaveLength(0);
    const stopped = runtime();
    stopped.props.set("WWG_ENABLED", "false");
    stopped.tick();
    expect(stopped.sent).toHaveLength(0);
  });
  it("本番と分離したテスト通知コードの構文が有効", () => {
    expect(
      () =>
        new vm.Script(
          readFileSync("automation/garbage/TestNotifications.gs", "utf8"),
        ),
    ).not.toThrow();
  });
});
