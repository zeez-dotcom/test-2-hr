import { test, expect } from '@playwright/test';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

const routes = [
  { path: '/login', text: 'Login' },
  { path: '/employees', text: 'Employees' },
  { path: '/payroll', text: 'Payroll' }
];

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    for (const { path, text } of routes) {
      test(`navigate to ${path}`, async ({ page }) => {
        const response = await page.goto(`${baseURL}${path}`);
        expect(response?.ok()).toBeTruthy();
        await expect(page.getByText(text)).toBeVisible();
      });
    }
  });
}
