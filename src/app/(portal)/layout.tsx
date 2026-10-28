export const dynamic = "force-dynamic";
import { requireApprovedMember } from "@/lib/auth-server";
import { MemberProvider } from "@/components/member-context";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireApprovedMember();
  return <MemberProvider member={member}>{children}</MemberProvider>;
}
