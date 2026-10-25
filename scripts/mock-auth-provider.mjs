// Loopback test fixture only. It never sends mail and is not part of the public application.
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
const sessions = new Map(),
  profiles = new Map();
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
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-10-25T00:00:00Z",
  };
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
    if (url.pathname === "/auth/v1/otp")
      return reply(
        response,
        body.email?.startsWith("limited") ? 429 : 200,
        body.email?.startsWith("limited")
          ? { code: "over_email_send_rate_limit", msg: "rate limited" }
          : {},
      );
    if (url.pathname === "/auth/v1/verify") {
      if (body.token !== "123456" || !body.email?.endsWith("@example.invalid"))
        return reply(response, 400, {
          code: "otp_expired",
          msg: "invalid code",
        });
      const p = member(body.email),
        now = Math.floor(Date.now() / 1000),
        payload = {
          sub: p.user_id,
          email: p.email,
          role: "authenticated",
          aud: "authenticated",
          iat: now,
          exp: now + 3600,
          session_id: randomUUID(),
        };
      const jwt =
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
          "base64url",
        ) +
        "." +
        Buffer.from(JSON.stringify(payload)).toString("base64url") +
        "." +
        Buffer.from(randomUUID()).toString("base64url");
      sessions.set(jwt, p);
      return reply(response, 200, {
        access_token: jwt,
        refresh_token: randomUUID(),
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        user: user(p),
      });
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
    if (url.pathname === "/rest/v1/rpc/portal_request_access") {
      if (profile.status === "pending")
        profile.display_name = body.p_display_name;
      return reply(response, 200, profile);
    }
    const admin =
      profile.status === "approved" &&
      ["company", "system"].includes(profile.role);
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
