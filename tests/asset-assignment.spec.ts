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

    test.describe('Asset assignment', () => {
      test.beforeEach(async ({ page }) => {
        await page.route('**/api/assets', route => {
          if (route.request().method() === 'GET') {
            route.fulfill({ status: 200, body: JSON.stringify([{ id: 'a1', name: 'Laptop', status: 'available' }]) });
          } else {
            route.continue();
          }
        });
        await page.route('**/api/asset-assignments', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
        await page.route('**/api/employees', route => route.fulfill({ status: 200, body: JSON.stringify([{ id: 'e1', firstName: 'Jane', lastName: 'Doe' }]) }));
      });

      test('successfully assigns an asset', async ({ page }) => {
        await page.route('**/api/asset-assignments', route => {
          if (route.request().method() === 'POST') {
            route.fulfill({ status: 200, body: '{}' });
          } else {
            route.fulfill({ status: 200, body: JSON.stringify([]) });
          }
        });
        await page.goto(`${baseURL}/assets`);
        await page.getByRole('button', { name: 'Assign Asset' }).click();
        await page.getByLabel('Asset').click();
        await page.getByRole('option', { name: 'Laptop' }).click();
        await page.getByLabel('Employee').click();
        await page.getByRole('option', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Assign' }).click();
        await expect(page.getByText('Asset assigned')).toBeVisible();
      });
    });
  });
}

