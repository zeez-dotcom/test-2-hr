import { describe, it, expect } from 'vitest';
import { pdfBuffer, sanitizeString } from './pdf';

describe('pdf utility', () => {
  it('sanitizes strings', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('generates pdf buffer', async () => {
    const buffer = await pdfBuffer({
      content: [{ text: '<b>hello</b>' }],
      info: { title: 'Test', creationDate: new Date(0) }
    });
    expect(Buffer.from(buffer).toString('base64')).toMatchSnapshot();
  });
});
