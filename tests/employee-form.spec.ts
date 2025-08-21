import { test, expect } from '@playwright/test';
import { submitForm, submitAndExpectError, submitAndExpectSuccess } from './utils/formHelper';
import { viewports } from '../playwright.config';
import { captureScreenshot } from './utils/screenshot';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

const validFields = {
  'input[name="firstName"]': 'John',
  'input[name="lastName"]': 'Doe',
  'input[name="position"]': 'Developer',
  'input[name="salary"]': '1000',
  'input[name="startDate"]': '2024-01-01',
};

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test.describe('Employee form', () => {
      test.beforeEach(async ({ page }) => {
        await page.route('**/api/employees', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
        await page.route('**/api/departments', route => route.fulfill({ status: 200, body: JSON.stringify([{ id: 'd1', name: 'HR' }]) }));
        await page.goto(`${baseURL}/employees`);
        await page.getByRole('button', { name: 'Add Employee' }).click();
      });

      test('required-field errors', async ({ page }) => {
        await page.locator('form button[type="submit"]').click();
        await expect(page.getByText('First name is required')).toBeVisible();
        await expect(page.getByText('Last name is required')).toBeVisible();
        await expect(page.getByText('Position is required')).toBeVisible();
        await expect(page.getByText('Salary is required')).toBeVisible();
        await expect(page.getByText('Start date is required')).toBeVisible();
      });

      test('email format validation', async ({ page }) => {
        await submitForm(page, {
          ...validFields,
          'input[name="email"]': 'invalid-email'
        });
        await expect(page.getByText('Please enter a valid email')).toBeVisible();
      });

      test('handles 500 error', async ({ page }) => {
        await page.route('**/api/employees', route => {
          if (route.request().method() === 'POST') {
            route.fulfill({ status: 500, body: JSON.stringify({ message: 'Server error' }) });
          } else {
            route.fulfill({ status: 200, body: JSON.stringify([]) });
          }
        });
        await submitAndExpectError(page, { ...validFields }, 'Failed to add employee');
      });

      test('handles 429 error', async ({ page }) => {
        await page.route('**/api/employees', route => {
          if (route.request().method() === 'POST') {
            route.fulfill({ status: 429, body: JSON.stringify({ message: 'Too many requests' }) });
          } else {
            route.fulfill({ status: 200, body: JSON.stringify([]) });
          }
        });
        await submitAndExpectError(page, { ...validFields }, 'Failed to add employee');
      });

      test('handles timeout', async ({ page }) => {
        await page.route('**/api/employees', async route => {
          if (route.request().method() === 'POST') {
            await new Promise(res => setTimeout(res, 5000));
            await route.fulfill({ status: 200, body: '{}' });
          } else {
            await route.fulfill({ status: 200, body: JSON.stringify([]) });
          }
        });
        const submitBtn = page.locator('form button[type="submit"]');
        await submitForm(page, { ...validFields });
        await expect(submitBtn).toBeDisabled();
      });

      test('successful submission and optimistic update', async ({ page }) => {
        const employees: any[] = [];
        await page.route('**/api/employees', (route, request) => {
          if (request.method() === 'POST') {
            const newEmp = { id: '1', firstName: 'John', lastName: 'Doe', position: 'Developer' };
            employees.push(newEmp);
            route.fulfill({ status: 200, body: JSON.stringify(newEmp) });
          } else {
            route.fulfill({ status: 200, body: JSON.stringify(employees) });
          }
        });
        await submitAndExpectSuccess(page, { ...validFields, 'input[name="email"]': 'john@example.com' }, 'Employee added successfully');
        await expect(page.getByText('John Doe')).toBeVisible();
      });

      test('handles empty departments', async ({ page }) => {
        await page.route('**/api/departments', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
        await page.reload();
        await page.getByRole('button', { name: 'Add Employee' }).click();
        await page.getByLabel('Department').click();
        await expect(page.getByText('No results')).toBeVisible();
      });
    });
  });
}
