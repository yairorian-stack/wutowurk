import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">WUTO-WURK GROWTH PORTAL</p>
      <h1>ページが見つかりません</h1>
      <p>ホームから、もう一度お進みください。</p>
      <Link href="/" className="button primary">
        ホームへ戻る
      </Link>
    </main>
  );
}
