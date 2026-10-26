export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Login } from "@/components/login";
import { authConfig } from "@/lib/auth-config";
import { getAccess } from "@/lib/auth-server";
import { emailOtpReady } from "@/lib/email-otp-server";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await getAccess();
  if (access.state === "approved") redirect("/");
  if (["pending", "disabled"].includes(access.state)) redirect("/account");
  return <Login configured={authConfig() !== null} otpAvailable={await emailOtpReady()} failed={(await searchParams).error === "google"} />;
}
