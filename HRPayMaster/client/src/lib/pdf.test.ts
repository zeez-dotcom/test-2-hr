import { describe, it, expect } from 'vitest';
import pdfMake from 'pdfmake/build/pdfmake';
import {
  pdfBuffer,
  sanitizeString,
  buildEmployeeReport,
  buildEmployeeHistoryReport,
  buildBilingualActionReceipt,
  buildEmployeeFileReport,
} from './pdf';

const hasImage = (node: any): boolean => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasImage);
  if (typeof node === 'object') {
    if ('image' in node) return true;
    return Object.values(node).some(hasImage);
  }
  return false;
};

const collectTexts = (node: any): string[] => {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectTexts);
  if (typeof node === 'object') {
    const values = Object.entries(node)
      .filter(([key]) => key === 'text' || key === 'stack' || key === 'columns' || key === 'table' || key === 'body')
      .map(([, value]) => value);
    return values.flatMap(collectTexts);
  }
  return [];
};

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
    expect(hasImage(def.content)).toBe(true);
  });

  it('renders uploaded documents in the employee file report', () => {
    const def = buildEmployeeFileReport({
      employee: {
        firstName: 'Dana',
        lastName: 'Jones',
        id: 'emp-1',
        position: 'Engineer',
        profileImage: 'data:image/png;base64,AAAA',
      },
      events: [],
      loans: [],
      documents: [
        { title: 'Vacation approved (Mar 2024)', url: 'data:image/png;base64,BBBB' },
        { title: 'Civil ID Document', url: 'data:application/pdf;base64,CCCC' },
      ],
    });

    const serialized = JSON.stringify(def.content);
    expect(serialized).toContain('data:image/png;base64,BBBB');

    const texts = collectTexts(def.content);
    expect(texts).toContain('Civil ID Document');
    expect(texts).toContain('Open PDF attachment');
    expect(texts).toContain('Preview unavailable for PDF attachments.');

    const attachmentBlocks = (def.content as any[]).filter(
      block => block && typeof block === 'object' && 'stack' in block && block.unbreakable === true
    );

    expect(attachmentBlocks.length).toBeGreaterThanOrEqual(2);
    const imageAttachment = attachmentBlocks.find(block => collectTexts(block).includes('Vacation approved (Mar 2024)'));
    expect(imageAttachment).toBeDefined();
    const pdfAttachment = attachmentBlocks.find(block => collectTexts(block).includes('Civil ID Document'));
    expect(pdfAttachment).toBeDefined();
  });

  it('formats Arabic summary rows with proper spacing and colon placement', () => {
    const def = buildEmployeeFileReport({
      employee: {
        firstName: 'Hussein',
        lastName: 'Saber',
        id: 'emp-2',
        arabicName: 'حسين   صابر   وقار',
      },
      events: [],
      loans: [],
      documents: [],
      language: 'ar',
    });

    const texts = collectTexts(def.content);
    expect(texts).toContain('الاسم\u061C: حسين صابر وقار');
    expect(texts).not.toContain('الاسم: حسينصابر وقار');
  });

  it('adds employee code row and profile image to action receipt', () => {
    const def = buildBilingualActionReceipt({
      titleEn: 'Test Receipt',
      titleAr: 'إيصال الاختبار',
      detailsEn: [],
      detailsAr: [],
      employee: {
        firstName: 'Alice',
        lastName: 'Smith',
        id: '1',
        employeeCode: 'EMP-001',
        profileImage: 'data:image/png;base64,AAAA',
      },
    });

    expect(hasImage(def.content)).toBe(true);
    const texts = collectTexts(def.content);
    expect(texts).toContain('Employee Code: EMP-001');
  });

  it('renders Arabic employee line when provided', () => {
    const arabicLine = 'يؤكد هذا المستند أن أحمد (الهاتف: 123 • رمز الموظف: EMP-002) لديه سجل';
    const def = buildBilingualActionReceipt({
      titleEn: 'Test Receipt',
      titleAr: 'إيصال الاختبار',
      detailsEn: [],
      detailsAr: [],
      bodyEn: 'This document confirms the employee record.',
      bodyAr: arabicLine,
      employee: {
        firstName: 'Ahmed',
        lastName: 'Saleh',
        id: '2',
      },
    });

    const texts = collectTexts(def.content);
    expect(texts).toContain(arabicLine);
  });

  it('allows overriding receipt layout labels in both languages', () => {
    const def = buildBilingualActionReceipt({
      titleEn: 'Custom Receipt',
      titleAr: 'إيصال مخصص',
      detailsEn: ['First detail: 123'],
      detailsAr: ['التفصيل الأول: 123'],
      docNumber: 'DOC-123',
      issuedDate: '2024-01-01',
      employee: {
        firstName: 'Alice',
        lastName: 'Smith',
        id: '99',
        phone: '555-0100',
        position: 'Manager',
        employeeCode: 'EMP-999',
      },
      labels: {
        meta: {
          documentNumber: { en: 'Doc No', ar: 'رقم الوثيقة' },
          issuedDate: { en: 'Issued On', ar: 'تاريخ الإصدار' },
        },
        employeeSummary: {
          name: { en: 'Staff', ar: 'الموظفون' },
          code: { en: 'Staff Code', ar: 'رمز الطاقم' },
          id: { en: 'Staff ID', ar: 'هوية الطاقم' },
          phone: { en: 'Contact', ar: 'الاتصال' },
          position: { en: 'Role', ar: 'الدور' },
        },
        sections: {
          detailsEn: 'Overview',
          detailsAr: 'نظرة عامة',
        },
      },
    });

    const texts = collectTexts(def.content);
    expect(texts).toContain('Doc No: DOC-123');
    expect(texts).toContain('رقم الوثيقة\u061C: DOC-123');
    expect(texts).not.toContain('رقم الوثيقة: DOC-123');
    expect(texts).toContain('Issued On: 2024-01-01');
    expect(texts).toContain('تاريخ الإصدار\u061C: 2024-01-01');
    expect(texts).not.toContain('تاريخ الإصدار: 2024-01-01');
    expect(texts).toContain('Staff: Alice Smith');
    expect(texts).toContain('الموظفون\u061C: Alice Smith');
    expect(texts).not.toContain('الموظفون: Alice Smith');
    expect(texts).toContain('Staff Code: EMP-999');
    expect(texts).toContain('رمز الطاقم\u061C: EMP-999');
    expect(texts).not.toContain('رمز الطاقم: EMP-999');
    expect(texts).toContain('Staff ID: 99');
    expect(texts).toContain('هوية الطاقم\u061C: 99');
    expect(texts).not.toContain('هوية الطاقم: 99');
    expect(texts).toContain('Contact: 555-0100');
    expect(texts).toContain('الاتصال\u061C: 555-0100');
    expect(texts).toContain('Role: Manager');
    expect(texts).toContain('الدور\u061C: Manager');
    expect(texts).toContain('التفصيل الأول\u061C: 123');
    expect(texts).not.toContain('التفصيل الأول: 123');
    expect(texts).toContain('First detail: 123');
    expect(texts).toContain('Overview');
    expect(texts).toContain('نظرة عامة');
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
