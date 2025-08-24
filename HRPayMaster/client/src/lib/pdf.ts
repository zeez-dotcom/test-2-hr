import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
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

export interface EmployeeLite {
  firstName: string;
  lastName: string;
  id: string;
  position?: string | null;
}

export interface EmployeeEventLite {
  title: string;
  eventDate: string | Date;
  amount?: string | null;
}

export function buildEmployeeReport(data: { employee: EmployeeLite; events: EmployeeEventLite[] }): TDocumentDefinitions {
  const { employee, events } = data;
  return {
    info: { title: `${employee.firstName} ${employee.lastName} Report` },
    content: [
      { text: `${employee.firstName} ${employee.lastName}`, style: 'header' },
      employee.position ? { text: employee.position } : '',
      { text: `ID: ${employee.id}`, margin: [0, 0, 0, 10] },
      { text: 'Events', style: 'subheader' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['Title', 'Date'],
            ...events.map(e => [e.title, new Date(e.eventDate).toISOString().split('T')[0]]),
          ],
        },
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true },
      subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
    },
  };
}

export function buildEmployeeHistoryReport(employees: EmployeeLite[]): TDocumentDefinitions {
  return {
    info: { title: 'Employee History Report' },
    content: [
      { text: 'Employee History Report', style: 'header' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['Name', 'ID'],
            ...employees.map(e => [`${e.firstName} ${e.lastName}`, e.id]),
          ],
        },
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true },
    },
  };
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
