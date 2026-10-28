import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ウトウークスタッフ成長支援ポータル",
    short_name: "WUTO-WURK",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#243e35",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
