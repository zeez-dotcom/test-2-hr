import { test, expect } from '@playwright/test';
import { sanitizeImageSrc } from '../HRPayMaster/client/src/lib/sanitizeImageSrc';

test('sanitizeImageSrc accepts valid data URL', () => {
  const valid = 'data:image/png;base64,AAAA';
  expect(sanitizeImageSrc(valid)).toBe(valid);
});

test('sanitizeImageSrc rejects non-image data URL', () => {
  const invalid = 'data:text/plain;base64,AAAA';
  expect(sanitizeImageSrc(invalid)).toBe('');
});

test('sanitizeImageSrc rejects data URL missing base64', () => {
  const invalid = 'data:image/png;,AAAA';
  expect(sanitizeImageSrc(invalid)).toBe('');
});

test('sanitizeImageSrc rejects uppercase data URL', () => {
  const invalid = 'DATA:IMAGE/PNG;BASE64,AAAA';
  expect(sanitizeImageSrc(invalid)).toBe('');
});
