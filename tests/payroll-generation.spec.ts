import { test, expect } from '@playwright/test';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test.describe('Payroll generation', () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(`${baseURL}/login`);
        await page.fill('input[name="username"]', 'admin');
        await page.fill('input[name="password"]', 'admin');
        await Promise.all([
          page.waitForURL(`${baseURL}/`),
          page.click('button[type="submit"]')
        ]);

        await page.route('**/api/payroll', route => {
          if (route.request().method() === 'GET') {
            route.fulfill({ status: 200, body: JSON.stringify([]) });
          } else {
            route.continue();
          }
        });
      });

      test('required-field errors', async ({ page }) => {
        await page.goto(`${baseURL}/payroll`);
        await page.getByRole('button', { name: 'Generate Payroll' }).click();
        await page.click('form button[type="submit"]');
        await expect(page.getByText('Period is required')).toBeVisible();
        await expect(page.getByText('Start date is required')).toBeVisible();
        await expect(page.getByText('End date is required')).toBeVisible();
      });

      test('successful generation', async ({ page }) => {
        await page.route('**/api/payroll/generate', route => {
          route.fulfill({ status: 200, body: '{}' });
        });
        await page.goto(`${baseURL}/payroll`);
        await page.getByRole('button', { name: 'Generate Payroll' }).click();
        await page.fill('input[name="period"]', 'January 2024');
        await page.fill('input[name="startDate"]', '2024-01-01');
        await page.fill('input[name="endDate"]', '2024-01-31');
        await page.click('form button[type="submit"]');
        await expect(page.getByText('Payroll generated successfully')).toBeVisible();
      });
    });
  });
}

