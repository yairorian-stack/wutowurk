// Only fictional legacy UI tests use this loopback server. No authentication or private server APIs.
import http from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile("out-review/index.html");
const views = new Set([
  "/",
  "/vision",
  "/plans",
  "/daily",
  "/self-evaluation",
  "/shifts",
  "/garbage",
  "/library",
  "/settings",
]);
const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:3000").pathname;
  if (request.method !== "GET" || !views.has(path)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
});
server.listen(3000, "127.0.0.1", () =>
  console.log("Local fictional prototype regression server on loopback:3000"),
);
