import { describe, it, expect } from 'vitest';
import pdfMake from 'pdfmake/build/pdfmake';
import { pdfBuffer, sanitizeString, buildEmployeeReport, buildEmployeeHistoryReport } from './pdf';

describe('pdf utility', () => {
  it('sanitizes strings', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(sanitizeString('"HR & Co" <Ltd>')).toBe('"HR & Co" <Ltd>');
    expect(sanitizeString('مرحبا بالعالم')).toBe('مرحبا بالعالم');
    expect(sanitizeString('Hello\u0000World\u0007!')).toBe('HelloWorld!');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(null)).toBe('');
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
        ['<script>alert(1)</script>', '"Quotes" & Co', 'مرحبا بالعالم']
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

  it('rehydrates nested pdfMake VFS maps for Inter bold text', async () => {
    const pdfMakeAny = pdfMake as typeof pdfMake & { pdfMake?: { vfs?: Record<string, string> } };
    const originalVfs = pdfMakeAny.vfs;
    const originalNested = pdfMakeAny.pdfMake;
    const originalNestedVfs = originalNested?.vfs;

    try {
      pdfMakeAny.vfs = {};
      if (!pdfMakeAny.pdfMake) {
        pdfMakeAny.pdfMake = {};
      }
      if (pdfMakeAny.pdfMake) {
        pdfMakeAny.pdfMake.vfs = {};
      }

      const buffer = await pdfBuffer({
        content: [{ text: 'Bold Inter Text', font: 'Inter', bold: true }],
        defaultStyle: { font: 'Inter' },
        info: { title: 'Bold Test', creationDate: new Date(0) },
      });

      expect(buffer.length).toBeGreaterThan(100);
      expect(pdfMakeAny.vfs?.['Inter-SemiBold.ttf']).toBeTruthy();
      expect(pdfMakeAny.pdfMake?.vfs?.['Inter-SemiBold.ttf']).toBe(pdfMakeAny.vfs?.['Inter-SemiBold.ttf']);
    } finally {
      if (originalVfs) {
        pdfMakeAny.vfs = originalVfs;
      } else {
        delete pdfMakeAny.vfs;
      }

      if (originalNested) {
        pdfMakeAny.pdfMake = originalNested;
        if (originalNestedVfs) {
          originalNested.vfs = originalNestedVfs;
        } else {
          delete originalNested.vfs;
        }
      } else {
        delete pdfMakeAny.pdfMake;
      }
    }
  });
});
