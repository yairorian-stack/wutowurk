import { z } from "zod";

export const REPORTED_SALES_ELEMENT_ID = "wuto-wurk-reported-sales";
export const reportedSalesSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    as_of_sales_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }),
    stores: z
      .array(
        z.object({
          store_id: z.enum(["honten", "816"]),
          sales_jpy: z.number().int().min(0).max(10_000_000_000),
        }),
      )
      .length(2),
  })
  .superRefine((value, ctx) => {
    if (!value.as_of_sales_date.startsWith(`${value.month}-`))
      ctx.addIssue({
        code: "custom",
        message: "対象月と累計の基準日が一致しません",
      });
    if (new Set(value.stores.map((s) => s.store_id)).size !== 2)
      ctx.addIssue({
        code: "custom",
        message: "両店舗の月累計を指定してください",
      });
  });
export type ReportedSales = z.infer<typeof reportedSalesSchema>;
export function readReportedSales(): ReportedSales | null {
  if (typeof document === "undefined") return null;
  const raw = document.getElementById(REPORTED_SALES_ELEMENT_ID)?.textContent;
  if (!raw) return null;
  try {
    const parsed = reportedSalesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
