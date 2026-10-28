import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth-config";
import { authClient } from "@/lib/auth-server";
import { loginSchema, memberSchema, normalizedName } from "@/lib/membership";

export async function GET(request: Request) {
  const config = authConfig();
  if (!config) return new Response("ログインの接続設定が必要です。", { status: 503 });
  const jar = await cookies();
  const attempt = jar.get("wuto-oauth-attempt")?.value;
  jar.set("wuto-oauth-attempt", "", { path: "/auth/callback", maxAge: 0, httpOnly: true, secure: config.secure, sameSite: "lax" });
  const supabase = (await authClient())!;
  let acquiredSession = false;
  let destination = "/login?error=google";
  try {
    const query = new URL(request.url).searchParams;
    const code = query.get("code");
    const identity = loginSchema.parse(JSON.parse(attempt ?? "null"));
    if (!code || code.length > 4096 || query.has("error")) throw new Error("oauth-failed");
    // Supabase SSR stores a server-side HttpOnly PKCE verifier cookie. A code from
    // a different browser/attempt cannot be exchanged successfully.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new Error("exchange-failed");
    acquiredSession = true;
    const { data: verified, error: verifyError } = await supabase.auth.getUser();
    const user = verified.user;
    if (verifyError || !user?.email_confirmed_at || user.email?.toLowerCase() !== identity.email ||
        !user.identities?.some((i) => i.provider === "google")) throw new Error("identity-mismatch");
    const { data: profile, error: profileError } = await supabase.rpc("portal_accept_google_invitation", {
      p_display_name: identity.displayName,
    });
    const member = memberSchema.safeParse(profile);
    if (profileError || !member.success || member.data.status === "disabled" ||
        member.data.user_id !== user.id || member.data.email !== identity.email ||
        normalizedName(member.data.display_name) !== normalizedName(identity.displayName)) throw new Error("not-invited");
    destination = member.data.status === "approved" ? "/" : "/account";
  } catch {
    if (acquiredSession) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  // Fixed same-origin destinations; never use next/redirectTo from the query.
  const response = NextResponse.redirect(new URL(destination, config.origin), 303);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
