import { test, expect } from '@playwright/test';
import { submitForm, submitAndExpectError } from './utils/formHelper';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test.describe('Login form', () => {
      test('required field errors', async ({ page }) => {
        await page.goto(`${baseURL}/login`);
        await page.click('button[type="submit"]');
        await expect(page.getByText('Username and password are required')).toBeVisible();
      });

      test('handles 500 error response', async ({ page }) => {
        await page.route('**/login', route => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Server error' })
        }));
        await page.goto(`${baseURL}/login`);
        await submitAndExpectError(page, {
          '#username': 'john',
          '#password': 'doe'
        }, 'Server error');
      });

      test('handles 429 error response', async ({ page }) => {
        await page.route('**/login', route => route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Too many requests' })
        }));
        await page.goto(`${baseURL}/login`);
        await submitAndExpectError(page, {
          '#username': 'john',
          '#password': 'doe'
        }, 'Too many requests');
      });

      test('handles timeout', async ({ page }) => {
        await page.route('**/login', async route => {
          await new Promise(res => setTimeout(res, 5000));
          await route.fulfill({ status: 200, body: '{}' });
        });
        await page.goto(`${baseURL}/login`);
        const submitBtn = page.locator('button[type="submit"]');
        await submitForm(page, { '#username': 'john', '#password': 'doe' });
        await expect(submitBtn).toBeDisabled();
      });

      test('successful submission', async ({ page }) => {
        await page.route('**/login', route => route.fulfill({ status: 200, body: '{}' }));
        await page.route('**/api/me', route => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', username: 'john' })
        }));
        await page.goto(`${baseURL}/login`);
        await submitForm(page, {
          '#username': 'john',
          '#password': 'doe'
        });
        await expect(page).toHaveURL(`${baseURL}/`);
      });
    });
  });
}
