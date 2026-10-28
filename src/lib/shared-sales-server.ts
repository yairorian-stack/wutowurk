import "server-only";
import { authClient } from "./auth-server";
import type { Member } from "./membership";
import { canonicalSalesFromRows, sharedCashFromRows, sharedSalesFromRows, type SharedFinanceDetails, type SharedSalesState } from "./shared-sales";
export async function readSharedSales(member: Member): Promise<SharedSalesState> {
  if (member.status !== "approved" || !["manager", "company", "system"].includes(member.role)) return { status: "restricted" };
  try {
    const client = await authClient();
    if (!client) return { status: "unavailable" };
    const canonical = await client.from("portal_sales_records").select("store_id,sales_date,sales_jpy,reported_yoy").order("sales_date").limit(3001);
    if (!canonical.error) {
      const details: SharedFinanceDetails = {};
      const [latest, success, month] = await Promise.all([
        client.from("portal_sync_runs").select("attempted_at,last_success_at,status").order("attempted_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("portal_sync_runs").select("last_success_at").not("last_success_at","is",null).order("last_success_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("portal_cash_months").select("month,opening_jpy").order("month", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (latest.data) details.sync = { ...latest.data, last_success_at: success.data?.last_success_at ?? null };
      if (month.data && !month.error) {
        const cash = await client.from("portal_cash_records").select("transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy")
          .eq("store_id","honten").eq("active",true).gte("transaction_date",month.data.month).lt("transaction_date",nextMonth(month.data.month)).order("source_order").limit(5001);
        try { if (cash.error) throw new Error(); details.cash = sharedCashFromRows(month.data,cash.data); } catch { details.cashUnavailable = true; }
      } else if (month.error) details.cashUnavailable = true;
      if (canonical.data?.length) return { status: "ready", data: canonicalSalesFromRows(canonical.data), ...details };
      return { status: "pending", ...details };
    }
    // Only an unapplied additive migration may use the existing read-only snapshot.
    if (canonical.error.code !== "PGRST205") return { status: "unavailable" };
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

function nextMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth()+1);
  return date.toISOString().slice(0,10);
}
