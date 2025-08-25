import { describe, it, expect } from 'vitest';
import { sanitizeImageSrc } from './sanitizeImageSrc';

describe('sanitizeImageSrc', () => {
  it('allows base64 image data URL', () => {
    const url = 'data:image/jpeg;base64,AAAA';
    expect(sanitizeImageSrc(url)).toBe(url);
  });

  it('rejects invalid data URL', () => {
    const url = 'data:text/plain;base64,AAAA';
    expect(sanitizeImageSrc(url)).toBe('');
  });
});
