import { monthlySummary, type FinanceState } from "./finance";
import { today, type StoreId } from "./domain";

export function monthlyTargetProgress(
  state: FinanceState,
  ids: readonly StoreId[],
  month: string,
  now = today(),
) {
  const current = monthlySummary(state, ids, month, now).current;
  const targets = ids.flatMap((id) => {
    const target = state.targets.find(
      (t) => t.storeId === id && t.month === month,
    );
    return target ? [target] : [];
  });
  const ready = ids.length > 0 && targets.length === ids.length;
  const salesTarget = ready
    ? targets.reduce((sum, t) => sum + t.salesTarget, 0)
    : null;
  const plannedHours = targets.reduce(
    (sum, t) => sum + t.salesTarget / t.productivityTarget,
    0,
  );
  // Company target = planned sales / planned hours, rather than averaging store rates.
  const productivityTarget =
    ready && salesTarget != null ? salesTarget / plannedHours : null;
  const productivity = current.minutes
    ? (current.sales * 60) / current.minutes
    : null;
  return {
    current,
    targets,
    ready,
    salesTarget,
    productivityTarget,
    productivity,
    salesPercent:
      salesTarget == null ? null : (current.sales / salesTarget) * 100,
    productivityPercent:
      productivityTarget == null || productivity == null
        ? null
        : (productivity / productivityTarget) * 100,
    remainingSales:
      salesTarget == null ? null : Math.max(0, salesTarget - current.sales),
    laborBudgetMinutes: ready ? Math.floor(plannedHours * 60 + 1e-8) : null,
  };
}
