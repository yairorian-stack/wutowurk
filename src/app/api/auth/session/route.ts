import { authJson, getAccess } from "@/lib/auth-server";
export async function GET() {
  const access = await getAccess();
  return authJson(
    {
      state: access.state,
      ...(access.state === "approved" ? { member: access.member } : {}),
    },
    access.state === "approved"
      ? 200
      : access.state === "unconfigured" || access.state === "unavailable"
        ? 503
        : 401,
  );
}
