export const ANAN_GARBAGE_URL =
  "https://www.city.anan.tokushima.jp/docs/2025071000030/";
export const garbageCategories = {
  plastic: {
    label: "プラ容器包装",
    vi: "Bao bì, hộp nhựa",
    ja: "中身を使い切り、汚れを落として分別してください。",
    explanationVi: "Dùng hết sản phẩm, làm sạch bao bì nhựa rồi phân loại.",
  },
  cans: {
    label: "カン",
    vi: "Lon kim loại",
    ja: "中身を空にして、すすいでください。",
    explanationVi: "Đổ hết chất bên trong và tráng sạch lon.",
  },
  pet: {
    label: "ペットボトル",
    vi: "Chai nhựa PET",
    ja: "中身を空にし、キャップ・ラベルを外してすすいでください。",
    explanationVi:
      "Đổ hết chất bên trong, tháo nắp và nhãn rồi tráng sạch chai PET.",
  },
  glass: {
    label: "ビン",
    vi: "Chai, lọ thủy tinh",
    ja: "中身を空にしてすすぎ、キャップは素材ごとに分別してください。",
    explanationVi:
      "Đổ hết chất bên trong, tráng sạch chai lọ và phân loại nắp theo chất liệu.",
  },
  nonburn: {
    label: "不燃",
    vi: "Rác không cháy",
    ja: "危険物や事業系ごみは混ぜず、市の分別方法を確認してください。",
    explanationVi:
      "Không trộn chất nguy hiểm hoặc rác thải kinh doanh; hãy kiểm tra hướng dẫn phân loại của thành phố.",
  },
  bulky: {
    label: "粗大",
    vi: "Rác cồng kềnh",
    ja: "対象品目・出し方を市の案内で確認してください。",
    explanationVi:
      "Kiểm tra loại đồ được thu gom và cách đưa rác ra theo hướng dẫn của thành phố.",
  },
} as const;
export type GarbageCategory = keyof typeof garbageCategories;
// User-provided comparison fixture. This is not an official PDF extraction.
export const novemberGarbageFixture: {
  date: string;
  categories: GarbageCategory[];
}[] = [
  { date: "2026-11-06", categories: ["plastic"] },
  { date: "2026-11-13", categories: ["cans"] },
  { date: "2026-11-17", categories: ["plastic"] },
  { date: "2026-11-24", categories: ["pet"] },
  { date: "2026-11-25", categories: ["glass"] },
  { date: "2026-11-27", categories: ["nonburn", "bulky"] },
];
export function garbageReminderDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
export function garbageWeekday(date: string) {
  return ["日", "月", "火", "水", "木", "金", "土"][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
}
