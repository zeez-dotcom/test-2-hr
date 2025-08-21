import { Page, TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function sanitize(text: string) {
  return text.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

export async function captureScreenshot(page: Page, testInfo: TestInfo, viewport: string) {
  await fs.promises.mkdir('artifacts', { recursive: true });
  const file = `${sanitize(testInfo.title)}-${viewport}.png`;
  const filePath = path.join('artifacts', file);
  await page.screenshot({ path: filePath, fullPage: true });
}
