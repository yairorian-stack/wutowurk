// Loopback test fixture only. It never sends mail and is not part of the public application.
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
const sessions = new Map(),
  profiles = new Map(), codes = new Map(), otpDeliveries = new Map(), otpCodes = new Map(), sessionMethods = new Map();
function member(email) {
  const hash = createHash("sha256").update(email).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  if (!profiles.has(id)) {
    const role = email.startsWith("owner")
      ? "company"
      : email.startsWith("manager")
        ? "manager"
        : "staff";
    profiles.set(id, {
      user_id: id,
      email,
      display_name: "テストスタッフ",
      job_title:
        role === "company"
          ? "総合責任者"
          : role === "manager"
            ? "店長業務"
            : "社員",
      role,
      store_id:
        role === "company" || email.startsWith("pending")
          ? null
          : email.startsWith("manager-other")
            ? "816"
            : "honten",
      status: email.startsWith("pending")
        ? "pending"
        : email.startsWith("disabled")
          ? "disabled"
          : "approved",
    });
  }
  return profiles.get(id);
}
function user(profile) {
  return {
    id: profile.user_id,
    email: profile.email,
    email_confirmed_at: "2026-10-25T00:00:00Z",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: profile.email.startsWith("emailonly") ? "email" : "google", providers: ["google"] },
    user_metadata: {},
    identities: [{ provider: "google", identity_data: { email: profile.email, email_verified: true } }],
    created_at: "2026-10-25T00:00:00Z",
  };
}
function session(p, method) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: p.user_id, email: p.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600,
    session_id: randomUUID(), app_metadata: user(p).app_metadata, amr: [{ method, timestamp: now }] };
  const jwt = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + Buffer.from(randomUUID()).toString("base64url");
  sessions.set(jwt, p); sessionMethods.set(jwt, method);
  return { access_token: jwt, refresh_token: randomUUID(), token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: user(p) };
}
function reply(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}
http
  .createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:3101");
    if (url.pathname === "/health")
      return reply(response, 200, { fixture: true });
    let raw = "";
    for await (const part of request) raw += part;
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return reply(response, 400, {});
    }
    const token = request.headers.authorization?.replace(/^Bearer /, ""),
      profile = sessions.get(token);
    if (url.pathname === "/auth/v1/authorize") {
      const destination = new URL(url.searchParams.get("redirect_to"));
      if (destination.origin !== "http://127.0.0.1:3100") return reply(response, 400, {});
      const email = url.searchParams.get("login_hint");
      if (email?.startsWith("cancel")) destination.searchParams.set("error", "access_denied");
      else {
        const code = randomUUID();
        codes.set(code, { email: email?.startsWith("mismatch") ? "other@example.invalid" : email, challenge: url.searchParams.get("code_challenge") });
        destination.searchParams.set("code", code);
      }
      response.writeHead(302, { Location: destination.href });
      return response.end();
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      const grant = codes.get(body.auth_code);
      codes.delete(body.auth_code);
      const challenge = createHash("sha256").update(body.code_verifier ?? "").digest("base64url");
      if (!grant || grant.challenge !== challenge || !grant.email?.endsWith("@example.invalid"))
        return reply(response, 400, { code: "invalid_grant", msg: "invalid code" });
      const p = member(grant.email);
      return reply(response, 200, session(p, p.email.startsWith("emailonly") ? "otp" : "oauth"));
    }
    if (url.pathname === "/fixture/otp-count") return reply(response, 200, { count: otpDeliveries.get(url.searchParams.get("email")) ?? 0 });
    if (url.pathname === "/rest/v1/rpc/portal_email_otp_ready") return reply(response, 200, true);
    if (url.pathname === "/auth/v1/otp") {
      if (body.create_user !== false) return reply(response, 400, { msg: "unexpected signup" });
      otpDeliveries.set(body.email, (otpDeliveries.get(body.email) ?? 0) + 1);
      if (body.email?.startsWith("deliveryfail")) return reply(response, 500, { msg: "email delivery failed" });
      otpCodes.set(body.email, "123456");
      return reply(response, 200, {});
    }
    if (url.pathname === "/auth/v1/verify") {
      if (body.type !== "email" || otpCodes.get(body.email) !== body.token || body.email?.startsWith("expired"))
        return reply(response, 401, { code: "otp_expired", msg: "invalid code" });
      otpCodes.delete(body.email);
      return reply(response, 200, session(member(body.email), "otp"));
    }
    if (!profile)
      return reply(response, 401, { code: "bad_jwt", msg: "invalid token" });
    if (url.pathname === "/auth/v1/user")
      return reply(response, 200, user(profile));
    if (url.pathname === "/auth/v1/logout") {
      sessions.delete(token);
      response.writeHead(204);
      return response.end();
    }
    const allowed = !["unlisted", "emailonly", "revoked"].some((prefix) => profile.email.startsWith(prefix));
    if (url.pathname === "/rest/v1/rpc/portal_access_allowed") {
      if (profile.email.startsWith("legacy")) return reply(response, 404, { code: "PGRST202", message: "function not found" });
      return reply(response, 200, allowed);
    }
    if (url.pathname === "/rest/v1/rpc/portal_accept_email_invitation") {
      if (!allowed || sessionMethods.get(token) !== "otp" || profile.status !== "approved") return reply(response, 403, { message: "denied" });
      return reply(response, 200, profile);
    }
    if (url.pathname === "/rest/v1/rpc/portal_google_allowed") return reply(response, 200, allowed);
    if (url.pathname === "/rest/v1/rpc/portal_accept_google_invitation") {
      if (!allowed || profile.status === "disabled" || body.p_display_name !== "テストスタッフ")
        return reply(response, 403, { message: "denied" });
      return reply(response, 200, profile);
    }
    const admin =
      profile.status === "approved" &&
      ["company", "system"].includes(profile.role);
    if (url.pathname === "/rest/v1/portal_sales_imports") return reply(response, 200,
      admin || profile.role === "manager" ? { id: "fixture", source: "架空の共有実績テスト", as_of: "2026-10-02" } : null);
    if (url.pathname === "/rest/v1/portal_sales_daily") {
      const rows = [
        { store_id: "honten", sales_date: "2026-10-01", sales_jpy: 1500, cumulative_jpy: 1500, reported_yoy: 110 },
        { store_id: "honten", sales_date: "2026-10-02", sales_jpy: null, cumulative_jpy: 1500, reported_yoy: 90 },
        { store_id: "816", sales_date: "2026-10-01", sales_jpy: 600, cumulative_jpy: 600, reported_yoy: 100 },
        { store_id: "816", sales_date: "2026-10-02", sales_jpy: 400, cumulative_jpy: 1000, reported_yoy: 120 },
      ];
      return reply(response, 200, rows.filter(r => admin || (profile.role === "manager" && r.store_id === profile.store_id)));
    }
    if (url.pathname === "/rest/v1/portal_members") {
      let rows = [...profiles.values()].filter(
        (p) => admin || p.user_id === profile.user_id,
      );
      const id = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      if (id) rows = rows.filter((p) => p.user_id === id);
      return reply(
        response,
        200,
        request.headers.accept?.includes("application/vnd.pgrst.object+json")
          ? (rows[0] ?? null)
          : rows,
      );
    }
    if (url.pathname === "/rest/v1/rpc/portal_manage_member") {
      if (!admin) return reply(response, 403, { message: "denied" });
      const target = profiles.get(body.p_user_id);
      if (
        !target ||
        (profile.role !== "system" &&
          (["company", "system"].includes(body.p_role) ||
            ["company", "system"].includes(target.role)))
      )
        return reply(response, 403, { message: "denied" });
      Object.assign(target, {
        role: body.p_role,
        job_title: body.p_job_title,
        store_id: body.p_store_id,
        status: body.p_status,
      });
      return reply(response, 200, target);
    }
    reply(response, 404, {});
  })
  .listen(3101, "127.0.0.1", () =>
    console.log("Loopback fake auth provider; no external email delivery."),
  );
