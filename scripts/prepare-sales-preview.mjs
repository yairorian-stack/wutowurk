// Produces a private, reviewable HTML copy. This script does not deploy it.
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  reportedSalesSchema,
  REPORTED_SALES_ELEMENT_ID,
} from "../src/lib/reported-sales.ts";

const input = process.argv[2],
  destination = process.argv[3];
if (!input || !destination)
  throw new Error(
    "Usage: node scripts/prepare-sales-preview.mjs <private-json> <private-html>",
  );
const root = await realpath(process.cwd());
const output = path.resolve(destination);
await mkdir(path.dirname(output), { recursive: true });
const parent = await realpath(path.dirname(output));
if (parent === root || parent.startsWith(`${root}${path.sep}`))
  throw new Error(
    "Keep the private preview outside the repository until publication is approved.",
  );
const data = reportedSalesSchema.parse(
  JSON.parse(await readFile(input, "utf8")),
);
const base = await readFile("out-review/index.html", "utf8");
if (base.includes(`<script id="${REPORTED_SALES_ELEMENT_ID}"`))
  throw new Error("The base already contains a monthly snapshot.");
const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
const tags = `<script id="${REPORTED_SALES_ELEMENT_ID}" type="application/json">${payload}</script><script>if(!location.hash)location.hash='/daily';</script>`;
await writeFile(output, base.replace("<script>", `${tags}<script>`), {
  mode: 0o600,
});
console.log("Prepared a private monthly-sales preview; nothing was published.");
