import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "./auth-config";
import { OtpGuard, parseOtpAllowlist } from "./otp-security";

export const otpCookie = "wuto-email-attempt";
const runtime = globalThis as typeof globalThis & { __wutoEmailOtpGuard?: OtpGuard };
export const otpGuard = runtime.__wutoEmailOtpGuard ??= new OtpGuard();
// The DB dispatcher checks the private, synchronized staff ledger. Null only
// disables the duplicate local list; verified DB invitation checks remain mandatory.
export const otpAllowlist = () => process.env.PORTAL_STAFF_OTP_MODE === "ledger"
  ? null : parseOtpAllowlist(process.env.PORTAL_OTP_ALLOWED_EMAILS);
function mailClient() {
  const config = authConfig();
  return config ? createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" }) },
  }) : null;
}
export async function emailOtpReady() {
  if (process.env.PORTAL_STAFF_OTP_MODE === "ledger") {
    try {
      const { data, error } = await mailClient()!.rpc("portal_staff_otp_ready");
      return !error && data === true;
    } catch { return false; }
  }
  if (!otpAllowlist()?.size) return false;
  try {
    const client = mailClient();
    if (!client) return false;
    const { data, error } = await client.rpc("portal_email_otp_ready");
    return !error && data === true;
  } catch { return false; }
}
export async function sendEmailOtp(email: string) {
  try {
    // Recheck server configuration before the scheduled side effect.
    const allowlist = otpAllowlist();
    if ((allowlist !== null && !allowlist.has(email)) || !await emailOtpReady()) return;
    const client = mailClient()!;
    if (process.env.PORTAL_STAFF_OTP_MODE === "ledger") {
      // Same opaque result for eligible, unlisted and rate-limited recipients.
      const { error } = await client.rpc("portal_request_staff_otp", { p_email: email });
      if (error) console.warn("Staff OTP dispatch unavailable.");
      return;
    }
    // Only the private send allowlist reaches this point. First-time invited staff
    // must be able to receive a code before an Auth account exists. Database
    // invitation checks still gate membership after email ownership is verified.
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) console.warn("Email OTP delivery not confirmed; backup Google login remains available.");
  } catch {
    // No recipient, code, provider response body, token, or SMTP secret in logs.
    console.warn("Email OTP delivery not confirmed; backup Google login remains available.");
  }
}
