// Prepare a private review artifact without committing or publishing real sales.
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { loadTsModule } from "./load-ts-module.mjs";
const { parseImportedSales, IMPORTED_SALES_ELEMENT_ID } = await loadTsModule(
  "src/lib/imported-sales.ts",
);
const [input, destination] = process.argv.slice(2);
if (!input || !destination)
  throw new Error(
    "Usage: node scripts/prepare-daily-sales-preview.mjs <private-json> <private-html>",
  );
const root = await realpath(process.cwd()),
  output = path.resolve(destination);
await mkdir(path.dirname(output), { recursive: true });
const parent = await realpath(path.dirname(output));
if (parent === root || parent.startsWith(`${root}${path.sep}`))
  throw new Error("Private previews must stay outside the repository.");
const data = parseImportedSales(await readFile(input, "utf8"));
const html = await readFile("out-review/index.html", "utf8");
if (html.includes(`<script id="${IMPORTED_SALES_ELEMENT_ID}"`))
  throw new Error("The base already has a daily-sales payload.");
const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
const scripts = `<script id="${IMPORTED_SALES_ELEMENT_ID}" type="application/json">${payload}</script><script>if(!location.hash)location.hash='/daily';</script>`;
await writeFile(output, html.replace("<script>", `${scripts}<script>`), {
  mode: 0o600,
});
console.log("Prepared a private daily-sales preview. Nothing was published.");
