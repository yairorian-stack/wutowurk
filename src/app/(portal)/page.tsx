import { requireApprovedMember } from "@/lib/auth-server";
import { Portal } from "@/components/portal";
import { SharedSalesProvider } from "@/components/shared-sales-context";
import { readSharedSales } from "@/lib/shared-sales-server";
export default async function Page() {
  const member = await requireApprovedMember();
  const sales = await readSharedSales(member, true);
  return <SharedSalesProvider value={sales}><Portal view="home" /></SharedSalesProvider>;
}
