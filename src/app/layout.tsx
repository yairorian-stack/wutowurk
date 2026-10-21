import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WUTO-WURK | スタッフ成長支援ポータル",
    template: "%s | WUTO-WURK",
  },
  description:
    "一皿から、その土地を好きになる。スタッフと店舗の、小さな一歩を育てるポータル。",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "WUTO-WURK", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#243e35",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
