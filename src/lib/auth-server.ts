import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { authConfig } from "./auth-config";
import { memberSchema, type Member } from "./membership";

export async function authClient() {
  const config = authConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      secure: config.secure,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure: config.secure,
              sameSite: "lax",
              path: "/",
            });
        } catch {
          /* Refresh cookies are persisted by proxy/route handlers, never during rendering. */
        }
      },
    },
  });
}
export type Access = {
  state:
    | "unconfigured"
    | "anonymous"
    | "unavailable"
    | "pending"
    | "disabled"
    | "approved";
  member: Member | null;
};
export const getAccess = cache(async (): Promise<Access> => {
  const supabase = await authClient();
  if (!supabase) return { state: "unconfigured", member: null };
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user || !user.email_confirmed_at)
      return { state: "anonymous", member: null };
    const { data: allowed, error: allowError } = await supabase.rpc("portal_google_allowed");
    if (allowError) return { state: "unavailable", member: null };
    if (allowed !== true) return { state: "disabled", member: null };
    const { data, error: profileError } = await supabase
      .from("portal_members")
      .select("user_id,email,display_name,job_title,role,store_id,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) return { state: "unavailable", member: null };
    const parsed = memberSchema.safeParse(data);
    if (!parsed.success) return { state: "pending", member: null };
    const member = parsed.data;
    if (
      member.email.toLowerCase() !== user.email?.toLowerCase() ||
      (member.status === "approved" &&
        ["staff", "manager"].includes(member.role) &&
        !member.store_id)
    )
      return { state: "disabled", member };
    return { state: member.status, member };
  } catch {
    return { state: "unavailable", member: null };
  }
});
export async function requireApprovedMember() {
  const access = await getAccess();
  if (access.state === "anonymous" || access.state === "unconfigured")
    redirect("/login");
  if (access.state !== "approved" || !access.member) redirect("/account");
  return access.member;
}
export function authJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Vary: "Cookie, Origin" },
  });
}
export async function readSmallJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid-input");
  if (Number(request.headers.get("content-length") ?? "0") > 4096)
    throw new Error("invalid-input");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid-input");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      throw new Error("invalid-input");
    }
    chunks.push(value);
  }
  const value = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(value);
}
