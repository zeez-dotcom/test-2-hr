import { test, expect } from '@playwright/test';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';
import en from '../HRPayMaster/client/src/locales/en.json';
import ar from '../HRPayMaster/client/src/locales/ar.json';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

const translations: any = { en, ar };

function t(lang: string, key: string) {
  return key.split('.').reduce((obj: any, k) => obj[k], translations[lang]);
}

const routes = [
  { path: '/login', key: 'login.submit', selector: 'button[type="submit"]' },
  { path: '/employees', key: 'nav.employees', selector: 'a[href="/employees"]' },
  { path: '/payroll', key: 'nav.payroll', selector: 'a[href="/payroll"]' }
];

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    for (const lang of ['en', 'ar']) {
      for (const { path, key, selector } of routes) {
        test(`${lang} navigate to ${path}`, async ({ page }) => {
          await page.goto('about:blank');
          await page.evaluate(l => localStorage.setItem('language', l), lang);
          const response = await page.goto(`${baseURL}${path}`);
          expect(response?.ok()).toBeTruthy();
          await expect(page.locator(selector)).toHaveText(t(lang, key));
        });
      }
    }
  });
}
