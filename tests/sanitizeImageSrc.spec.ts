import { test, expect } from '@playwright/test';
import { sanitizeImageSrc } from '../HRPayMaster/client/src/pages/reports';

test('sanitizeImageSrc accepts valid data URL', () => {
  const valid = 'data:image/png;base64,AAAA';
  expect(sanitizeImageSrc(valid)).toBe(valid);
});

test('sanitizeImageSrc rejects malformed data URL', () => {
  const invalid = 'data:text/plain;base64,AAAA';
  expect(sanitizeImageSrc(invalid)).toBe('');
});
