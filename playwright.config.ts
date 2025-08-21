import { defineConfig } from '@playwright/test';

export const viewports = {
  '360x740': { width: 360, height: 740 },
  '768x1024': { width: 768, height: 1024 },
  '1280x800': { width: 1280, height: 800 },
  '1440x900': { width: 1440, height: 900 }
};

export default defineConfig({
  testDir: './tests',
  outputDir: 'artifacts'
});
