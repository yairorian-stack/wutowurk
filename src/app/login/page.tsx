export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Login } from "@/components/login";
import { authConfig } from "@/lib/auth-config";
import { getAccess } from "@/lib/auth-server";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await getAccess();
  if (access.state === "approved") redirect("/");
  if (["pending", "disabled"].includes(access.state)) redirect("/account");
  return <Login configured={authConfig() !== null} failed={(await searchParams).error === "google"} />;
}
