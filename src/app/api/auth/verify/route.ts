import { authJson } from "@/lib/auth-server";
// Retired: Google OAuth with a private database allowlist is the only login path.
export async function POST() {
  return authJson({ message: "Googleログインをご利用ください。" }, 410);
}
