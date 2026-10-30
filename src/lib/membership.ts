import { z } from "zod";
export const jobTitles = [
  "総合責任者",
  "店長業務",
  "社員",
  "パートアルバイト",
  "他メンバー",
] as const;
export const loginSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "氏名を入力してください")
    .max(80)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "氏名を確認してください"),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email("メールアドレスを確認してください"))
    .transform((v) => v.toLowerCase()),
});
export const verifySchema = loginSchema.extend({
  code: z.string().regex(/^\d{6,10}$/, "メールの確認コードを入力してください"),
});
export const memberSchema = z.object({
  user_id: z.uuid(),
  email: z.email(),
  display_name: z.string().min(1).max(80),
  job_title: z.enum(jobTitles).nullable(),
  role: z.enum(["staff", "manager", "company", "system"]),
  store_id: z.enum(["honten", "816"]).nullable(),
  status: z.enum(["pending", "approved", "disabled"]),
  read_all_stores: z.boolean().optional().default(false),
});
export type Member = z.infer<typeof memberSchema>;
export const memberUpdateSchema = z
  .object({
    userId: z.uuid(),
    jobTitle: z.enum(jobTitles),
    role: z.enum(["staff", "manager", "company", "system"]),
    storeId: z.enum(["honten", "816"]).nullable(),
    status: z.enum(["pending", "approved", "disabled"]),
  })
  .refine(
    (v) =>
      v.status !== "approved" ||
      v.role === "company" ||
      v.role === "system" ||
      v.storeId !== null,
    "スタッフ・店舗管理者の承認には所属店舗が必要です",
  );
export function normalizedName(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}
export function memberCanManage(member: Member) {
  return (
    member.status === "approved" &&
    (member.role === "company" || member.role === "system")
  );
}
