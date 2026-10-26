import "server-only";
import { authClient } from "./auth-server";
import type { Member } from "./membership";
import { sharedSalesFromRows, type SharedSalesState } from "./shared-sales";
export async function readSharedSales(member: Member): Promise<SharedSalesState> {
  if (member.status !== "approved" || !["manager", "company", "system"].includes(member.role)) return { status: "restricted" };
  try {
    const client = await authClient();
    if (!client) return { status: "unavailable" };
    const { data: batch, error } = await client.from("portal_sales_imports")
      .select("id,source,as_of").order("imported_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return { status: error.code === "PGRST205" ? "pending" : "unavailable" };
    if (!batch) return { status: "pending" };
    const { data, error: rowError } = await client.from("portal_sales_daily")
      .select("store_id,sales_date,sales_jpy,cumulative_jpy,reported_yoy")
      .eq("batch_id", batch.id).lte("sales_date", batch.as_of).order("sales_date").limit(3000);
    if (rowError) return { status: "unavailable" };
    if (!data?.length) return { status: "pending" };
    return { status: "ready", data: sharedSalesFromRows(batch, data) };
  } catch { return { status: "unavailable" }; }
}
