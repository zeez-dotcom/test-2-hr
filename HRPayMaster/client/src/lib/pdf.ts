import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts as any;

export const sanitizeString = (str: string): string =>
  str.replace(/[&<>"']/g, c => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });

function sanitize(obj: any): any {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj instanceof Date) { return obj; }
  if (obj && typeof obj === 'object') {
    const res: any = {};
    for (const [key, value] of Object.entries(obj)) {
      res[key] = sanitize(value);
    }
    return res;
  }
  return obj;
}

export function openPdf(docDefinition: TDocumentDefinitions) {
  const sanitized = sanitize(docDefinition) as TDocumentDefinitions;
  pdfMake.createPdf(sanitized).open();
}

export function pdfBuffer(docDefinition: TDocumentDefinitions): Promise<Uint8Array> {
  const sanitized = sanitize(docDefinition) as TDocumentDefinitions;
  return new Promise(resolve => {
    pdfMake.createPdf(sanitized).getBuffer((buffer: Uint8Array) => {
      resolve(buffer);
    });
  });
}
