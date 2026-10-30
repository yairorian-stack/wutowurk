import { addDays, weekStart, type StoreId } from "./domain";
import type { ImportedSales } from "./imported-sales";

// Actual shared records only. Missing dates/hours are never treated as zero.
export function storePerformance(
  data: ImportedSales,
  store: StoreId,
  asOf: string,
  manualDates: string[] = [],
) {
  const month = asOf.slice(0, 7);
  const monthRows = data.rows.filter(
    (r) => r.date.startsWith(`${month}-`) && r.date <= asOf && r[store].sales !== null,
  );
  const last = monthRows.at(-1);
  // A source cumulative ratio cannot describe a locally overridden monthly total.
  const overridden = manualDates.some((d) => d.startsWith(`${month}-`) && d <= (last?.date ?? ""));
  const monthSales = monthRows.reduce((sum, r) => sum + r[store].sales!, 0);
  const start = weekStart(asOf);
  const todayEntered = data.rows.some((r) => r.date === asOf && r[store].sales !== null);
  const through = todayEntered ? asOf : addDays(asOf, -1);
  const weekRows = data.rows.filter(
    (r) => r.date >= start && r.date <= through && r[store].sales !== null,
  );
  const expected = Math.max(0, Math.round((Date.parse(through) - Date.parse(start)) / 86400000) + 1);
  const missingSales = expected - weekRows.length;
  const missingLabor = weekRows.filter(
    (r) => r[store].laborMinutes == null || (r[store].sales! > 0 && r[store].laborMinutes === 0),
  ).length;
  const sales = weekRows.reduce((sum, r) => sum + r[store].sales!, 0);
  const laborMinutes = weekRows.reduce((sum, r) => sum + (r[store].laborMinutes ?? 0), 0);
  const complete = expected > 0 && missingSales === 0 && missingLabor === 0;
  return {
    month, monthSales: last ? monthSales : null, monthThrough: last?.date ?? null,
    yoy: overridden ? null : (last?.[store].reportedYoy ?? null), overridden,
    weekStart: start, weekEnd: addDays(start, 6), weekThrough: expected ? through : null,
    sales, laborMinutes, missingSales, missingLabor, enteredDays: weekRows.length,
    salesPerLaborHour: complete && laborMinutes > 0 ? sales / (laborMinutes / 60) : null,
  };
}
