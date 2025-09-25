import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableLayout } from 'pdfmake/interfaces';
import { getBrand } from './brand';
import { sanitizeImageSrc } from './sanitizeImageSrc';
import { arabicFontConfig, arabicFontVfs } from './pdf-fonts';

const baseVfs = (pdfFonts as any)?.pdfMake?.vfs ?? (pdfFonts as any);
pdfMake.vfs = { ...baseVfs, ...arabicFontVfs } as any;

const existingFonts = (pdfMake as any).fonts ?? {};
(pdfMake as any).fonts = {
  ...existingFonts,
  Roboto: existingFonts.Roboto ?? {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
  ...arabicFontConfig,
};

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
  profileImage?: string | null;
}

export interface EmployeeEventLite {
  title: string;
  eventDate: string | Date;
  amount?: string | null;
}

export function buildEmployeeReport(
  data: { employee: EmployeeLite; events: EmployeeEventLite[] }
): TDocumentDefinitions {
  const { employee, events } = data;
  const firstName = sanitizeString(employee.firstName);
  const lastName = sanitizeString(employee.lastName);
  const position = employee.position ? sanitizeString(employee.position) : '';
  const id = sanitizeString(employee.id);
  const image = employee.profileImage ? sanitizeImageSrc(employee.profileImage) : undefined;
  const headerRow: Content = {
    columns: [
      image ? { image, width: 56, margin: [0, 0, 10, 0] } : { text: '' },
      {
        stack: [
          { text: `${firstName} ${lastName}`, style: 'title' },
          position ? { text: position, style: 'muted' } : '',
          { text: `Employee ID: ${id}`, style: 'muted' },
        ].filter(Boolean) as Content[],
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 12],
  };

  const tableLayout: TableLayout = {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F8FAFC' : rowIndex % 2 === 0 ? '#F1F5F9' : null),
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };

  const content: any[] = [
    headerRow,
    { text: 'Events', style: 'section' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto'],
        body: [
          ['Title', 'Date'],
          ...events.map(e => [
            sanitizeString(e.title),
            new Date(e.eventDate).toISOString().split('T')[0]
          ]),
        ],
      },
      layout: tableLayout,
    },
  ];

  const brand = getBrand();
  const titleColor = brand.primaryColor || '#0F172A';
  return {
    info: { title: `${firstName} ${lastName} Report` },
    pageMargins: [40, 56, 40, 56],
    content,
    styles: {
      title: { fontSize: 20, bold: true, color: titleColor },
      section: { fontSize: 12, bold: true, color: titleColor, margin: [0, 14, 0, 6] },
      muted: { fontSize: 10, color: '#64748B' },
    },
    defaultStyle: { fontSize: 10, color: '#111827' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' • ');
        return [
          { text: contact ? `${left} • ${contact}` : left, style: 'muted' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'muted' },
        ];
      })(),
      margin: [40, 0, 40, 20],
    }),
  };
}

export function buildEmployeeFileReport(params: {
  employee: EmployeeLite;
  events: EmployeeEventLite[];
  loans: { amount: string; remainingAmount: string; monthlyDeduction: string; status: string }[];
  documents: { title: string; createdAt?: string; url?: string }[];
}): TDocumentDefinitions {
  const { employee, events, loans, documents } = params;
  const base = buildEmployeeReport({ employee, events });
  const loansBody = [
    ['Amount', 'Remaining', 'Monthly', 'Status'],
    ...loans.map(l => [l.amount, l.remainingAmount, l.monthlyDeduction, l.status]),
  ];
  const docsBody = [
    ['Title', 'Created'],
    ...documents.map(d => [d.title, d.createdAt ? new Date(d.createdAt).toISOString().split('T')[0] : ''])
  ];
  const tableLayout: TableLayout = {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F8FAFC' : rowIndex % 2 === 0 ? '#F1F5F9' : null),
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };
  (base.content as any[]).push({ text: 'Loans', style: 'section', pageBreak: 'before' });
  (base.content as any[]).push({ table: { headerRows: 1, widths: ['auto','auto','auto','auto'], body: loansBody }, layout: tableLayout });
  (base.content as any[]).push({ text: 'Documents', style: 'section', margin: [0,10,0,0] });
  (base.content as any[]).push({ table: { headerRows: 1, widths: ['*','auto'], body: docsBody }, layout: tableLayout });
  return base;
}

export function buildEmployeeHistoryReport(
  employees: EmployeeLite[]
): TDocumentDefinitions {
  const tableLayout: TableLayout = {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F8FAFC' : rowIndex % 2 === 0 ? '#F1F5F9' : null),
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };
  const brand = getBrand();
  const titleColor = brand.primaryColor || '#0F172A';
  return {
    info: { title: 'Employee History Report' },
    pageMargins: [40, 56, 40, 56],
    content: [
      { text: 'Employee History Report', style: 'title', margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['Name', 'ID'],
            ...employees.map(e => [
              `${sanitizeString(e.firstName)} ${sanitizeString(e.lastName)}`,
              sanitizeString(e.id),
            ]),
          ],
        },
        layout: tableLayout,
      },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: titleColor },
    },
    defaultStyle: { fontSize: 10, color: '#111827' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' • ');
        return [
          { text: contact ? `${left} • ${contact}` : left, style: 'muted' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'muted' },
        ];
      })(),
      margin: [40, 0, 40, 20],
    }),
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

export function controllerNumber(): string {
  const dt = new Date();
  const ymd = dt.toISOString().slice(0,19).replace(/[-:T]/g, '');
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `DOC-${ymd}-${rnd}`;
}

export function buildBilingualActionReceipt(params: {
  titleEn: string;
  titleAr: string;
  employee: { firstName: string; lastName: string; id: string; position?: string | null };
  detailsEn: string[];
  detailsAr: string[];
  logo?: string | null;
}): TDocumentDefinitions {
  const brand = getBrand();
  const { titleEn, titleAr, employee, detailsEn, detailsAr } = params;
  const logo = (params as any).logo ?? brand.logo ?? null;
  const fullName = `${sanitizeString(employee.firstName)} ${sanitizeString(employee.lastName)}`;
  const docNo = controllerNumber();
  const header: any[] = [];
  if (logo) header.push({ image: sanitizeImageSrc(logo), width: 80, margin: [0,0,10,0] });
  header.push({ text: 'HR Action Receipt / إيصال إجراء الموارد البشرية', style: 'title' });
  const titleColor = brand.primaryColor || '#0F172A';
  return {
    info: { title: `${titleEn} - ${fullName}` },
    pageMargins: [40, 56, 40, 56],
    content: [
      { columns: header, columnGap: 10 },
      { text: `Document No: ${docNo}`, alignment: 'right', margin: [0,6,0,10], style: 'muted' },
      { text: `${titleEn} / ${titleAr}`, style: 'section' },
      { text: `Employee: ${fullName} (ID: ${sanitizeString(employee.id)})`, margin: [0,0,0,10], style: 'muted' },
      {
        columns: [
          [
            { text: 'Details (EN)', bold: true, margin: [0,0,0,5] },
            ...detailsEn.map(d => ({ text: sanitizeString(d), margin: [0,2,0,0] })),
          ],
          [
            { text: 'تفاصيل (AR)', bold: true, margin: [0,0,0,5], alignment: 'right' },
            ...detailsAr.map(d => ({ text: sanitizeString(d), margin: [0,2,0,0], alignment: 'right' })),
          ],
        ],
        columnGap: 20,
      },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: titleColor },
      section: { fontSize: 12, bold: true, color: titleColor, margin: [0, 14, 0, 6] },
      muted: { fontSize: 10, color: '#64748B' },
    },
    defaultStyle: { fontSize: 10, color: '#111827' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' • ');
        return [
          { text: contact ? `${left} • ${contact}` : left, style: 'muted' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'muted' },
        ];
      })(),
      margin: [40, 0, 40, 20],
    }),
  };
}

export async function buildAndEncodePdf(doc: TDocumentDefinitions): Promise<string> {
  const buffer = await pdfBuffer(doc);
  const b64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return `data:application/pdf;base64,${b64}`;
}
