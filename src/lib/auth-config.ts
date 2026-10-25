export type AuthConfig = {
  url: string;
  key: string;
  origin: string;
  secure: boolean;
};
export function authConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig | null {
  try {
    const url = new URL(env.SUPABASE_URL ?? ""),
      origin = new URL(env.PORTAL_ORIGIN ?? ""),
      key = env.SUPABASE_PUBLISHABLE_KEY ?? "";
    const local = (v: URL) =>
      v.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(v.hostname);
    if (
      !key ||
      url.username ||
      url.password ||
      origin.username ||
      origin.password ||
      url.search ||
      url.hash ||
      origin.search ||
      origin.hash ||
      url.pathname !== "/" ||
      origin.pathname !== "/"
    )
      return null;
    if (
      !(url.protocol === "https:" && origin.protocol === "https:") &&
      !(local(url) && local(origin))
    )
      return null;
    if (key.startsWith("sb_secret_")) return null;
    // Reject legacy service-role JWTs. Only the publishable/anon key belongs here.
    if (key.split(".").length === 3) {
      const role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
      if (role !== "anon") return null;
    }
    return {
      url: url.origin,
      origin: origin.origin,
      key,
      secure: origin.protocol === "https:",
    };
  } catch {
    return null;
  }
}
export function allowedOrigin(request: Request, config: AuthConfig) {
  return request.headers.get("origin") === config.origin;
}
