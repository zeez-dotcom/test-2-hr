import { describe, it, expect } from 'vitest';
import { pdfBuffer, sanitizeString, buildEmployeeReport, buildEmployeeHistoryReport } from './pdf';

describe('pdf utility', () => {
  it('sanitizes strings', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('generates pdf buffer', async () => {
    const buffer = await pdfBuffer({
      content: [{ text: '<b>hello</b>' }],
      info: { title: 'Test', creationDate: new Date(0) }
    });
    const b64 = Buffer.from(buffer).toString('base64');
    expect(b64.startsWith('JVBERi0xL')).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('sanitizes nested structures', async () => {
    const buffer = await pdfBuffer({
      content: [
        { text: '<img src=x onerror=alert(1)>' },
        ['<script>alert(1)</script>']
      ],
      info: { title: '<b>Nested</b>', creationDate: new Date(0) }
    });
    const b64 = Buffer.from(buffer).toString('base64');
    expect(b64.startsWith('JVBERi0xL')).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('creates employee report', async () => {
    const def = buildEmployeeReport({
      employee: { firstName: '<b>Alice</b>', lastName: 'Smith', id: '1' },
      events: [{ title: '<i>Bonus</i>', eventDate: new Date(0) }]
    });
    def.info = { ...(def.info || {}), creationDate: new Date(0) };
    const buffer = await pdfBuffer(def);
    expect(Buffer.from(buffer).toString('base64').startsWith('JVBERi0xL')).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('adds profile image when provided', () => {
    const def = buildEmployeeReport({
      employee: {
        firstName: 'Alice',
        lastName: 'Smith',
        id: '1',
        profileImage: 'data:image/png;base64,AAAA',
      },
      events: [],
    });
    const hasImage = (n: any): boolean => {
      if (!n) return false;
      if (Array.isArray(n)) return n.some(hasImage);
      if (typeof n === 'object') {
        if ('image' in n) return true;
        return Object.values(n).some(hasImage);
      }
      return false;
    };
    expect(hasImage(def.content)).toBe(true);
  });

  it('creates employee history report', async () => {
    const def = buildEmployeeHistoryReport([
      { firstName: '<b>Alice</b>', lastName: 'Smith', id: '1' },
      { firstName: 'Bob', lastName: '<i>Jones</i>', id: '2' },
    ]);
    def.info = { ...(def.info || {}), creationDate: new Date(0) };
    const buffer = await pdfBuffer(def);
    const b64 = Buffer.from(buffer).toString('base64');
    expect(b64.startsWith('JVBERi0xL')).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });
});
