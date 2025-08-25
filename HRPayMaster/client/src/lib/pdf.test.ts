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
    expect(Buffer.from(buffer).toString('base64')).toMatchSnapshot();
  });

  it('sanitizes nested structures', async () => {
    const buffer = await pdfBuffer({
      content: [
        { text: '<img src=x onerror=alert(1)>' },
        ['<script>alert(1)</script>']
      ],
      info: { title: '<b>Nested</b>', creationDate: new Date(0) }
    });
    expect(Buffer.from(buffer).toString('base64')).toMatchSnapshot();
  });

  it('creates employee report', async () => {
    const def = buildEmployeeReport({
      employee: { firstName: '<b>Alice</b>', lastName: 'Smith', id: '1' },
      events: [{ title: '<i>Bonus</i>', eventDate: new Date(0) }]
    });
    def.info = { ...(def.info || {}), creationDate: new Date(0) };
    const buffer = await pdfBuffer(def);
    expect(Buffer.from(buffer).toString('base64')).toMatchSnapshot();
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
    expect(
      Array.isArray(def.content) &&
        def.content.some((c: any) => typeof c === 'object' && 'image' in c)
    ).toBe(true);
  });

  it('creates employee history report', async () => {
    const def = buildEmployeeHistoryReport([
      { firstName: '<b>Alice</b>', lastName: 'Smith', id: '1' },
      { firstName: 'Bob', lastName: '<i>Jones</i>', id: '2' },
    ]);
    def.info = { ...(def.info || {}), creationDate: new Date(0) };
    const buffer = await pdfBuffer(def);
    expect(Buffer.from(buffer).toString('base64')).toMatchSnapshot();
  });
});
