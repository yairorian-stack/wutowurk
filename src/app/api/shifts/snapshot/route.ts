import { readFile } from "node:fs/promises";
import { getAccess, authJson } from "@/lib/auth-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const access = await getAccess();
  if (access.state !== "approved" || !access.member) return authJson({error:"ログインが必要です"},401);
  const member = access.member;
  if (!["company","system"].includes(member.role) && member.store_id !== "816") return authJson({error:"閲覧できません"},403);
  try {
    const source = await readFile("/etc/secrets/hanoura-shift-2026-11.b64", "utf8");
    if (source.length > 2_000_000) throw new Error("invalid-snapshot");
    const image = Buffer.from(source.trim(), "base64");
    if (image.length < 8 || image.subarray(0,8).toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid-snapshot");
    return new Response(image, {headers:{"Content-Type":"image/png","Cache-Control":"no-store, private","Vary":"Cookie","X-Content-Type-Options":"nosniff","Content-Disposition":'inline; filename="hanoura-shift-2026-11-asof-20261029.png"'}});
  } catch { return authJson({error:"シフト原本は準備中です"},503); }
}
