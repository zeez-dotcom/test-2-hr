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

    test.describe('Loan approval', () => {
      test.beforeEach(async ({ page }) => {
        await page.route('**/api/loans', route => {
          if (route.request().method() === 'GET') {
            const loans = [{
              id: 'l1',
              status: 'pending',
              employee: { firstName: 'Jane', lastName: 'Doe' },
              amount: '1000',
              monthlyDeduction: '100',
              startDate: '2024-01-01',
              interestRate: '0',
              reason: ''
            }];
            route.fulfill({ status: 200, body: JSON.stringify(loans) });
          } else {
            route.continue();
          }
        });
        await page.route('**/api/employees', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
      });

      test('approves a pending loan', async ({ page }) => {
        await page.route('**/api/loans/l1', route => {
          route.fulfill({ status: 200, body: '{}' });
        });
        await page.goto(`${baseURL}/loans`);
        await page.getByRole('button', { name: 'Approve' }).click();
        await expect(page.getByText('Loan updated successfully')).toBeVisible();
      });
    });
  });
}

