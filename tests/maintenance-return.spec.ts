import { test, expect } from '@playwright/test';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

type CarResponse = {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  status: string;
  mileage: number;
  registrationOwner: string;
  registrationExpiry: string;
  vin: string;
  currentAssignment: null;
};

type AssetResponse = {
  id: string;
  name: string;
  type: string;
  status: string;
  currentAssignment: null;
};

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test('car requires repair details before returning to service', async ({ page }) => {
      const car: CarResponse = {
        id: 'car-1',
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
        plateNumber: 'ABC123',
        status: 'maintenance',
        mileage: 15200,
        registrationOwner: 'Acme Corp',
        registrationExpiry: '2025-01-01',
        vin: 'VIN123456789',
        currentAssignment: null,
      };

      await page.route('**/api/me', route =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ id: 'admin', username: 'Admin' })
        })
      );
      await page.route('**/api/company', route =>
        route.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/cars', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, body: JSON.stringify([car]) });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/car-assignments', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
      await page.route('**/api/employees', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
      await page.route('**/api/vacations', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));

      let repairSubmitted = false;
      await page.route('**/api/cars/car-1/repairs', async route => {
        expect(route.request().method()).toBe('POST');
        const body = route.request().postData() || '';
        expect(body).toContain('Completed maintenance');
        repairSubmitted = true;
        await route.fulfill({ status: 200, body: '{}' });
      });

      await page.route('**/api/cars/car-1/status', async route => {
        expect(repairSubmitted).toBeTruthy();
        const statusBody = JSON.parse(route.request().postData() || '{}');
        expect(statusBody.status).toBe('available');
        await route.fulfill({ status: 200, body: '{}' });
      });

      await page.goto(`${baseURL}/cars`);
      await page.getByRole('button', { name: 'Back to Service' }).click();
      const dialog = page.getByRole('dialog', { name: 'Return Car to Service' });
      await expect(dialog).toBeVisible();

      await page.getByLabel('Description').fill('Completed maintenance');
      const repairsRequest = page.waitForRequest('**/api/cars/car-1/repairs');
      const statusRequest = page.waitForRequest('**/api/cars/car-1/status');
      await page.getByRole('button', { name: 'Return to Service' }).click();
      await repairsRequest;
      await statusRequest;

      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByText('Car returned to service', { exact: true })
      ).toBeVisible();
    });

    test('asset repair log required before returning to service', async ({ page }) => {
      const asset: AssetResponse = {
        id: 'asset-1',
        name: '3D Printer',
        type: 'Equipment',
        status: 'maintenance',
        currentAssignment: null,
      };

      await page.route('**/api/me', route =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ id: 'admin', username: 'Admin' })
        })
      );
      await page.route('**/api/company', route =>
        route.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/assets', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, body: JSON.stringify([asset]) });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/asset-assignments', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
      await page.route('**/api/employees', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));

      let assetRepairSubmitted = false;
      await page.route('**/api/assets/asset-1/repairs', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, body: JSON.stringify([]) });
          return;
        }
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.description).toBe('Maintenance complete');
        expect(payload.cost).toBeUndefined();
        assetRepairSubmitted = true;
        await route.fulfill({ status: 200, body: '{}' });
      });

      await page.route('**/api/assets/asset-1/status', async route => {
        expect(assetRepairSubmitted).toBeTruthy();
        const statusBody = JSON.parse(route.request().postData() || '{}');
        expect(statusBody.status).toBe('available');
        await route.fulfill({ status: 200, body: '{}' });
      });

      await page.goto(`${baseURL}/assets`);
      await page.getByRole('button', { name: 'Back to Service' }).click();
      const dialog = page.getByRole('dialog', { name: 'Return Asset to Service' });
      await expect(dialog).toBeVisible();

      await page.getByLabel('Description').fill('Maintenance complete');
      const assetRepairsRequest = page.waitForRequest('**/api/assets/asset-1/repairs');
      const assetStatusRequest = page.waitForRequest('**/api/assets/asset-1/status');
      await page.getByRole('button', { name: 'Return to Service' }).click();
      await assetRepairsRequest;
      await assetStatusRequest;

      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByText('Asset returned to service', { exact: true })
      ).toBeVisible();
    });
  });
}
