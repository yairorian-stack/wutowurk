import "server-only";
import { authClient } from "./auth-server";
import {
  managerDailyRowSchema,
  managerExpenseRowSchema,
  mergeManagerCashMonth,
  type ManagerCashExpense,
  type ManagerDailyReport,
} from "./manager-daily";
import type { Member } from "./membership";
import {
  canonicalSalesFromRows,
  sharedCashFromRows,
  sharedSalesFromRows,
  type SharedFinanceDetails,
  type SharedSalesState,
} from "./shared-sales";

export async function readSharedSales(
  member: Member,
  summaryOnly = false,
): Promise<SharedSalesState> {
  if (
    member.status !== "approved" ||
    !["staff", "manager", "company", "system"].includes(member.role)
  )
    return { status: "restricted" };
  try {
    const client = await authClient();
    if (!client) return { status: "unavailable" };
    const canonical = await client
      .from("portal_sales_records")
      .select("store_id,sales_date,sales_jpy,reported_yoy,labor_minutes")
      .order("sales_date")
      .limit(3001);
    if (!canonical.error) {
      const details: SharedFinanceDetails = {};
      const [latest, success, months, statuses, reportsWithLabels, expensesResult] =
        await Promise.all([
          client
            .from("portal_sync_runs")
            .select("attempted_at,last_success_at,status")
            .order("attempted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          client
            .from("portal_sync_runs")
            .select("last_success_at")
            .not("last_success_at", "is", null)
            .order("last_success_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          summaryOnly ? Promise.resolve({ data: [], error: null }) : client
            .from("portal_cash_months")
            .select("store_id,month,opening_jpy")
            .order("month", { ascending: false })
            .limit(25),
          summaryOnly ? Promise.resolve({ data: [], error: null }) : client
            .from("portal_cash_sync_status")
            .select("store_id,month,status,message_code,last_success_at")
            .order("month", { ascending: false })
            .limit(50),
          client
            .from("portal_manager_daily_reports")
            .select(
              "store_id,report_date,sales_jpy,cash_sales_jpy,cash_sales_label,credit_sales_jpy,credit_sales_label,qr_sales_jpy,qr_sales_label,gift_certificate_jpy,gift_certificate_label,other_cashless_jpy,other_cashless_label,labor_minutes,voucher_count,voucher_discount_jpy,memo,revision,updated_at",
            )
            .order("report_date")
            .limit(3001),
          summaryOnly ? Promise.resolve({ data: [], error: null }) : client
            .from("portal_manager_cash_expenses")
            .select(
              "store_id,report_date,sort_order,category,description,amount_jpy",
            )
            .order("report_date")
            .order("sort_order")
            .limit(5001),
        ]);
      if (latest.data)
        details.sync = {
          ...latest.data,
          last_success_at: success.data?.last_success_at ?? null,
        };
      if (!statuses.error && statuses.data)
        details.cashStatuses = statuses.data;
      else if (statuses.error?.code !== "PGRST205")
        details.cashUnavailable = true;

      let managerReports: ManagerDailyReport[] = [];
      let managerExpenses: ManagerCashExpense[] = [];
      let reportRows: unknown = reportsWithLabels.data;
      let reportError = reportsWithLabels.error;
      let labelsReady = true;
      if (
        reportError &&
        ["42703", "PGRST204"].includes(reportError.code)
      ) {
        const fallback = await client
          .from("portal_manager_daily_reports")
          .select(
            "store_id,report_date,sales_jpy,cash_sales_jpy,credit_sales_jpy,qr_sales_jpy,gift_certificate_jpy,other_cashless_jpy,labor_minutes,voucher_count,voucher_discount_jpy,memo,revision,updated_at",
          )
          .order("report_date")
          .limit(3001);
        reportRows = fallback.data;
        reportError = fallback.error;
        labelsReady = false;
      }
      if (reportError || expensesResult.error) {
        details.managerDailyStatus =
          reportError?.code === "PGRST205" ||
          expensesResult.error?.code === "PGRST205"
            ? "setup-required"
            : "unavailable";
      } else {
        const parsedReports = managerDailyRowSchema.array().safeParse(
          reportRows,
        );
        const parsedExpenses = managerExpenseRowSchema.array().safeParse(
          expensesResult.data,
        );
        if (parsedReports.success && parsedExpenses.success) {
          managerReports = parsedReports.data;
          managerExpenses = parsedExpenses.data;
          details.managerDailyStatus = labelsReady ? "ready" : "setup-required";
          details.managerReports = managerReports;
          details.managerExpenses = managerExpenses;
        } else details.managerDailyStatus = "unavailable";
      }

      details.cashMonths = [];
      if (!months.error && months.data && months.data.length < 25) {
        const results = await Promise.all(
          months.data
            .map(async (month) => {
              const cash = await client
                .from("portal_cash_records")
                .select(
                  "transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy",
                )
                .eq("store_id", month.store_id)
                .eq("active", true)
                .gte("transaction_date", month.month)
                .lt("transaction_date", nextMonth(month.month))
                .order("transaction_date")
                .order("source_order")
                .limit(5001);
              if (cash.error) throw new Error();
              const parsed = sharedCashFromRows(month, cash.data);
              const monthlyReports = managerReports.filter(
                (report) =>
                  report.store_id === month.store_id &&
                  report.report_date.startsWith(month.month.slice(0, 7)),
              );
              return {
                ...parsed,
                rows: monthlyReports.length
                  ? mergeManagerCashMonth(
                      parsed.opening_jpy,
                      parsed.rows,
                      monthlyReports,
                      managerExpenses,
                    )
                  : parsed.rows,
                store_id: month.store_id as "honten" | "816",
              };
            })
            .map((promise) =>
              promise.then(
                (data) => ({ data }),
                () => ({ data: null }),
              ),
            ),
        );
        for (const result of results)
          if (result.data) details.cashMonths.push(result.data);
          else details.cashUnavailable = true;
      } else if (months.error || (months.data && months.data.length >= 25))
        details.cashUnavailable = true;

      const manualKeys = new Set(
        managerReports.map(
          (report) => `${report.store_id}/${report.report_date}`,
        ),
      );
      const salesRows = [
        ...(canonical.data ?? []).filter(
          (row) => !manualKeys.has(`${row.store_id}/${row.sales_date}`),
        ),
        ...managerReports.map((report) => ({
          store_id: report.store_id,
          sales_date: report.report_date,
          sales_jpy: report.sales_jpy,
          reported_yoy: null,
          labor_minutes: report.labor_minutes,
        })),
      ];
      if (salesRows.length)
        return {
          status: "ready",
          data: canonicalSalesFromRows(salesRows),
          ...details,
        };
      return { status: "pending", ...details };
    }
    // Only an unapplied additive migration may use the existing read-only snapshot.
    if (canonical.error.code !== "PGRST205") return { status: "unavailable" };
    const { data: batch, error } = await client
      .from("portal_sales_imports")
      .select("id,source,as_of")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      return {
        status: error.code === "PGRST205" ? "pending" : "unavailable",
      };
    if (!batch) return { status: "pending" };
    const { data, error: rowError } = await client
      .from("portal_sales_daily")
      .select("store_id,sales_date,sales_jpy,cumulative_jpy,reported_yoy")
      .eq("batch_id", batch.id)
      .lte("sales_date", batch.as_of)
      .order("sales_date")
      .limit(3000);
    if (rowError) return { status: "unavailable" };
    if (!data?.length) return { status: "pending" };
    return { status: "ready", data: sharedSalesFromRows(batch, data) };
  } catch {
    return { status: "unavailable" };
  }
}

function nextMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
