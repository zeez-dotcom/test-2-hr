import { Page, expect } from '@playwright/test';

/**
 * Fills the given form fields and submits the form.
 * @param page Playwright page instance
 * @param fields Map of selector -> value to fill before submitting
 */
export async function submitForm(page: Page, fields: Record<string, string>) {
  for (const [selector, value] of Object.entries(fields)) {
    await page.fill(selector, value);
  }
  await page.click('button[type="submit"]');
}

/**
 * Submits a form with the provided data and asserts that an error message is shown.
 * @param page Playwright page instance
 * @param fields Map of selector -> value to fill
 * @param message Expected error message
 */
export async function submitAndExpectError(page: Page, fields: Record<string, string>, message: string) {
  await submitForm(page, fields);
  await expect(page.getByText(message)).toBeVisible();
}

/**
 * Submits a form with the provided data and asserts that a success message is shown.
 * @param page Playwright page instance
 * @param fields Map of selector -> value to fill
 * @param message Expected success message
 */
export async function submitAndExpectSuccess(page: Page, fields: Record<string, string>, message: string) {
  await submitForm(page, fields);
  await expect(page.getByText(message)).toBeVisible();
}
