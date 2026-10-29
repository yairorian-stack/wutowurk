import type { Role } from "./domain";
export type PortalDocument = { id: string; category: string; title: string; description: string; version: string; date: string; roles: Role[]; sections: string[][]; externalUrl?: string; };
export const documents: PortalDocument[] = [
  { id: "honten-recipe-costs", category: "原価・レシピ", title: "本店の原価管理表・仕込みレシピ", description: "仕入単価、仕込みの材料・分量、1回分と1個あたりの原価を確認できます。Googleスプレッドシートを別タブで開きます。", version: "1.0", date: "2026-10-29", roles: ["staff", "manager", "company", "system"], sections: [["原価管理", "仕入商品マスター 仕込みカード ハンバーグ 唐揚げ PIZZA レシピ"]], externalUrl: "https://docs.google.com/spreadsheets/d/1m3OGZebZmYTBglV1rr-I_l0LHDaGGpkcj8yFKVop3Tk/edit#gid=700105" },
  {
    id: "guide",
    category: "ポータル",
    title: "成長ポータルの使い方",
    description: "はじめての方へ。毎週の小さな一歩を記録する方法。",
    version: "1.0",
    date: "2026-10-21",
    roles: ["staff", "manager", "company", "system"] as Role[],
    sections: [
      [
        "まずは、今週の目標から",
        "ホームには選択した店舗の目標と達成率が表示されます。一般スタッフのプレビューでは所属店舗の目標を確認できます。",
      ],
      [
        "目標は、ひとつずつ具体的に",
        "店舗管理者以上のプレビューで週次アクション画面を開き、「目標を追加」を選びます。1店舗・1週間で最大3件です。行動、担当、期限を決めましょう。",
      ],
      [
        "できたことを、次の一歩に",
        "目標を完了にしたら、詳細の編集から成果と振り返りを記録します。未完了の目標は次週に繰り越せます。",
      ],
      [
        "この試作品の保存について",
        "データはこのブラウザーの中だけに保存されます。別の端末との共有はできません。実名・個人情報・社内機密は入力しないでください。",
      ],
    ],
  },
  {
    id: "meeting",
    category: "店舗運営",
    title: "週次ミーティングの進め方",
    description: "振り返りと、今週の3つの目標を決めるためのヒント。",
    version: "0.1",
    date: "2026-10-21",
    roles: ["staff", "manager", "company", "system"] as Role[],
    sections: [
      [
        "1. 先週の一歩を振り返る",
        "できたことを先に共有しましょう。お客さまの反応、仲間の工夫、良くなったことを言葉にします。",
      ],
      [
        "2. 今週の目標を3つ以内に絞る",
        "地域・お客さま・チームのために、今週できることを選びます。「誰が、何を、いつまでに」を明確にします。",
      ],
      [
        "3. チームで確かめる",
        "無理なく続けられる量か、みんなで確認します。保留にする判断も大切です。次週につながる気づきを記録しましょう。",
      ],
    ],
  },
  {
    id: "admin",
    category: "管理者向け",
    title: "管理者向け運用ガイド（試作品）",
    description: "店舗の切り替え、記録の管理、試作品の取り扱い。",
    version: "0.1",
    date: "2026-10-21",
    roles: ["manager", "company", "system"] as Role[],
    sections: [
      [
        "権限プレビューについて",
        "設定画面で4種類の役割を切り替え、表示と操作範囲を確認できます。本機能は認証ではなく、デモデータのUI確認用です。",
      ],
      [
        "資料公開のルール（本番設計）",
        "就業規則の原本や未承認の資料は、管理者が内容・版・公開範囲を確認してから公開します。現段階では原本を登録していません。",
      ],
      [
        "本番運用を始める前に",
        "個人ログイン、サーバー側の店舗別権限、資料の承認と非公開ストレージ、バックアップの実装・検証が必要です。",
      ],
    ],
  },
];


