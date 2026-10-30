import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const emailRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()).transform((v) => v.toLowerCase()),
});
export const emailVerifySchema = emailRequestSchema.extend({ code: z.string().regex(/^\d{6}$/) });
export function parseOtpAllowlist(value: string | undefined): Set<string> {
  if (!value?.trim()) return new Set();
  const values = value.split(",");
  if (values.length > 100) return new Set();
  const result = new Set<string>();
  for (const value of values) {
    const parsed = emailRequestSchema.safeParse({ email: value });
    if (!parsed.success) return new Set(); // A malformed configuration fails closed.
    result.add(parsed.data.email);
  }
  return result;
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
type Attempt = { emailHash: string; created: number; expires: number; tries: number; eligible: boolean };
type Budget = { count: number; reset: number; last: number };

// Per-process burst protection for the single-instance pilot. Supabase's shared
// Auth rate limits remain required across restarts/instances and direct API calls.
export class OtpGuard {
  private attempts = new Map<string, Attempt>();
  private budgets = new Map<string, Budget>();
  constructor(private now = () => Date.now()) {}
  private prune() {
    const now = this.now();
    for (const [k, v] of this.attempts) if (v.expires <= now) this.attempts.delete(k);
    for (const [k, v] of this.budgets) if (v.reset <= now) this.budgets.delete(k);
  }
  private reserve(key: string, limit: number, cooldown = 0) {
    const now = this.now();
    const value = this.budgets.get(key);
    if (value && (value.count >= limit || now - value.last < cooldown)) return false;
    if (!value && this.budgets.size >= 2048) return false;
    this.budgets.set(key, { count: (value?.count ?? 0) + 1, reset: value?.reset ?? now + 3600_000, last: now });
    return true;
  }
  begin(email: string, ip: string, allowed: Set<string> | null, previous?: string) {
    this.prune();
    const key = hash(email), existing = previous ? this.attempts.get(previous) : undefined;
    if (existing?.emailHash === key && this.now() - existing.created < 60_000)
      return { token: previous!, send: false };
    if (previous) this.attempts.delete(previous);
    const token = randomBytes(32).toString("base64url");
    const room = this.attempts.size < 2048;
    const eligible = room && (allowed === null || allowed.has(email)) && this.reserve("email:" + key, 5, 60_000) &&
      this.reserve("ip:" + hash(ip), 10) && this.reserve("global", 30);
    if (room) this.attempts.set(token, { emailHash: key, created: this.now(), expires: this.now() + 600_000, tries: 0, eligible });
    return { token, send: eligible };
  }
  consume(token: string | undefined, email: string, allowed: Set<string> | null) {
    this.prune();
    const attempt = token ? this.attempts.get(token) : undefined;
    if (!attempt || !attempt.eligible || attempt.emailHash !== hash(email) || (allowed !== null && !allowed.has(email)) || attempt.tries >= 5) return false;
    attempt.tries++;
    return true;
  }
  finish(token: string) { this.attempts.delete(token); }
}
