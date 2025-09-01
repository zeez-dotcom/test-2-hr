import { describe, it, expect } from 'vitest';
import { sanitizeImageSrc } from './sanitizeImageSrc';

describe('sanitizeImageSrc', () => {
  it('allows base64 image data URL', () => {
    const url = 'data:image/jpeg;base64,AAAA';
    expect(sanitizeImageSrc(url)).toBe(url);
  });

  it('allows non-image data URL', () => {
    const url = 'data:text/plain;base64,AAAA';
    expect(sanitizeImageSrc(url)).toBe(url);
  });

  it('rejects non-data non-http URL', () => {
    const url = 'javascript:alert(1)';
    expect(sanitizeImageSrc(url)).toBe('');
  });
});
