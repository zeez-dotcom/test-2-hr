import { test, expect } from '@playwright/test';
import { submitForm } from './utils/formHelper';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';
import en from '../HRPayMaster/client/src/locales/en.json';
import ar from '../HRPayMaster/client/src/locales/ar.json';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test.describe('Login form', () => {
      const translations: any = { en, ar };

      test('required field errors show in selected language', async ({ page }) => {
        for (const lang of ['en', 'ar']) {
          await page.goto('about:blank');
          await page.evaluate(l => localStorage.setItem('language', l), lang);
          await page.goto(`${baseURL}/login`);
          await page.click('button[type="submit"]');
          await expect(page.getByTestId('form-error')).toHaveText(
            translations[lang].errors.loginRequired
          );
        }
      });

      test('handles 500 error response', async ({ page }) => {
        await page.route('**/login', route => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Server error' })
        }));
        await page.goto('about:blank');
        await page.evaluate(() => localStorage.setItem('language', 'en'));
        await page.goto(`${baseURL}/login`);
        await submitForm(page, {
          '#username': 'john',
          '#password': 'doe'
        });
        await expect(page.getByTestId('form-error')).toHaveText('Server error');
      });

      test('handles 429 error response', async ({ page }) => {
        await page.route('**/login', route => route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Too many requests' })
        }));
        await page.goto('about:blank');
        await page.evaluate(() => localStorage.setItem('language', 'en'));
        await page.goto(`${baseURL}/login`);
        await submitForm(page, {
          '#username': 'john',
          '#password': 'doe'
        });
        await expect(page.getByTestId('form-error')).toHaveText('Too many requests');
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
