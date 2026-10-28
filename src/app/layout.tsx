import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WUTO-WURK | スタッフ成長支援ポータル",
    template: "%s | WUTO-WURK",
  },
  description:
    "世界１０ヵ国で、地域に必要とさせる飲食ブランドになる！！ 人に良いを基本とし、ワクワクと感動を創造し続けるスタッフポータル。",
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
