import { requireApprovedMember } from "@/lib/auth-server";
import { Portal } from "@/components/portal";
export default async function Page() {
  await requireApprovedMember();
  return <Portal view="plans" />;
}
