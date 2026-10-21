import { build } from "esbuild";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  output = path.join(root, "out-pages");
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ["src/portable/entry.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "next/link": path.join(root, "src/portable/link.tsx") },
  tsconfig: "tsconfig.json",
  write: false,
  legalComments: "eof",
});
async function cssFiles(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await cssFiles(p)));
    else if (p.endsWith(".css")) result.push(p);
  }
  return result;
}
const styles = await cssFiles(path.join(root, ".next/static"));
if (!styles.length)
  throw new Error("Run npm run build before creating the Pages preview");
const css = (await Promise.all(styles.map((f) => readFile(f, "utf8")))).join(
  "\n",
);
const icon = (await readFile("src/app/icon.svg")).toString("base64");
const js = bundle.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex,nofollow,noarchive"><title>WUTO-WURK スタッフ成長支援ポータル | 体験版</title><link rel="icon" href="data:image/svg+xml;base64,${icon}"><style>${css}</style></head><body><div id="root"></div><noscript>この体験版の操作にはJavaScriptが必要です。</noscript><script>${js}</script></body></html>`;
await writeFile(path.join(output, "index.html"), html);
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(
  path.join(output, "robots.txt"),
  "User-agent: *\nDisallow: /\n",
);
const notices = [];
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "lucide-react",
  "zod",
  "clsx",
]) {
  const dir = path.join(root, "node_modules", name);
  const files = await readdir(dir);
  const license = files.find((f) => /^license(?:\.(?:md|txt))?$/i.test(f));
  if (!license) throw new Error(`License missing: ${name}`);
  const meta = JSON.parse(
    await readFile(path.join(dir, "package.json"), "utf8"),
  );
  notices.push(
    `${name} ${meta.version}\n${await readFile(path.join(dir, license), "utf8")}`,
  );
}
await writeFile(
  path.join(output, "THIRD_PARTY_NOTICES.txt"),
  notices.join("\n\n" + "=".repeat(72) + "\n\n"),
);
console.log(`Prepared sample-only Pages preview: ${output}`);
