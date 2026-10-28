import { test as base } from "@playwright/test";

// Existing finance scenarios explicitly enter the sample before exercising it.
// Production-data absence is covered separately with the unmodified base test.
export const test = base.extend<{ sampleFinance: void }>({
  sampleFinance: [
    async ({ page }, use) => {
      await page.goto("/daily");
      await page
        .getByRole("button", { name: "サンプルで操作を試す", exact: true })
        .click();
      await use();
    },
    { auto: true },
  ],
});
