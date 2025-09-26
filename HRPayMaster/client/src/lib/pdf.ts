import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableLayout } from 'pdfmake/interfaces';
import { amiriRegularVfs } from './font-vfs';
import { getBrand } from './brand';
import { sanitizeImageSrc } from './sanitizeImageSrc';

const fontsModule = pdfFonts as any;

if (typeof fontsModule === 'function') {
  fontsModule(pdfMake);
}

const pdfMakeAny = pdfMake as unknown as {
  vfs: Record<string, string>;
  fonts?: Record<string, { normal: string; bold?: string; italics?: string; bolditalics?: string }>;
  addFileToVFS?: (file: string, data: string) => void;
};

let mergedVfs: Record<string, string> =
  (fontsModule?.pdfMake?.vfs as Record<string, string>) ??
  (pdfMakeAny?.vfs as Record<string, string>) ??
  (typeof fontsModule === 'object' ? (fontsModule as Record<string, string>) : {}) ??
  {};

if (typeof pdfMakeAny.addFileToVFS === 'function') {
  pdfMakeAny.addFileToVFS('Amiri-Regular.ttf', amiriRegularVfs);
  mergedVfs = pdfMakeAny.vfs;
} else {
  mergedVfs = { ...mergedVfs, 'Amiri-Regular.ttf': amiriRegularVfs };
  pdfMakeAny.vfs = mergedVfs;
}

pdfMakeAny.vfs = pdfMakeAny.vfs || mergedVfs;

pdfMakeAny.fonts = {
  ...(pdfMakeAny.fonts ?? {}),
  Amiri: {
    normal: 'Amiri-Regular.ttf',
    bold: 'Amiri-Regular.ttf',
    italics: 'Amiri-Regular.ttf',
    bolditalics: 'Amiri-Regular.ttf',
  },
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
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Amiri' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' | ');
        return [
          { text: contact ? `${left} | ${contact}` : left, style: 'muted' },
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
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Amiri' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' | ');
        return [
          { text: contact ? `${left} | ${contact}` : left, style: 'muted' },
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
  subheadingEn?: string;
  subheadingAr?: string;
  employee: {
    firstName: string;
    lastName: string;
    id: string;
    position?: string | null;
    phone?: string | null;
  };
  detailsEn: string[];
  detailsAr: string[];
  bodyEn?: string;
  bodyAr?: string;
  logo?: string | null;
  docNumber?: string;
  issuedDate?: string;
}): TDocumentDefinitions {
  const brand = getBrand();
  const logo = params.logo ?? brand.logo ?? null;
  const titleColor = brand.primaryColor || '#0F172A';
  const secondaryColor = brand.secondaryColor || '#334155';
  const docNo = params.docNumber ?? controllerNumber();
  const issued = params.issuedDate ?? new Date().toISOString().slice(0, 10);

  const fullName = `${sanitizeString(params.employee.firstName)} ${sanitizeString(params.employee.lastName)}`.trim();
  const employeeId = sanitizeString(params.employee.id);
  const employeePhone = params.employee.phone ? sanitizeString(params.employee.phone) : null;
  const employeePosition = params.employee.position ? sanitizeString(params.employee.position) : null;

  const titleEn = sanitizeString(params.titleEn);
  const titleAr = sanitizeString(params.titleAr);
  const subheadingEn = params.subheadingEn ? sanitizeString(params.subheadingEn) : null;
  const subheadingAr = params.subheadingAr ? sanitizeString(params.subheadingAr) : null;
  const bodyEn = params.bodyEn ? sanitizeString(params.bodyEn) : null;
  const bodyAr = params.bodyAr ? sanitizeString(params.bodyAr) : null;

  const content: Content[] = [];

  if (logo) {
    content.push({ image: sanitizeImageSrc(logo), width: 96, alignment: 'center', margin: [0, 0, 0, 12] });
  }

  if (brand.name) {
    content.push({ text: sanitizeString(brand.name), style: 'brand', alignment: 'center', margin: [0, 0, 0, 4] });
  }

  content.push({
    stack: [
      { text: titleEn, style: 'titleEn', alignment: 'center' },
      { text: titleAr, style: 'titleAr', alignment: 'center' },
    ],
    margin: [0, 0, 0, 12],
  });

  if (subheadingEn || subheadingAr) {
    content.push({
      stack: [
        subheadingEn ? { text: subheadingEn, style: 'subheadingEn', alignment: 'center' } : undefined,
        subheadingAr ? { text: subheadingAr, style: 'subheadingAr', alignment: 'center' } : undefined,
      ].filter(Boolean) as Content[],
      margin: [0, 0, 0, 12],
    });
  }

  content.push({
    columns: [
      { text: `Document No: ${docNo}`, style: 'meta' },
      { text: `Issued: ${issued}`, style: 'meta', alignment: 'right' },
    ],
    margin: [0, 0, 0, 12],
  });

  if (bodyEn || bodyAr) {
    content.push({
      stack: [
        bodyEn ? { text: bodyEn, style: 'bodyEn', margin: [0, 0, 0, 6] } : undefined,
        bodyAr ? { text: bodyAr, style: 'bodyAr', margin: [0, 0, 0, 6] } : undefined,
      ].filter(Boolean) as Content[],
      margin: [0, 0, 0, 12],
    });
  }

  const employeeSummary: string[] = [
    `Employee: ${fullName}`,
    `Employee ID: ${employeeId}`,
  ];
  if (employeePhone) employeeSummary.push(`Phone: ${employeePhone}`);
  if (employeePosition) employeeSummary.push(`Position: ${employeePosition}`);

  content.push({
    table: {
      widths: ['*'],
      body: employeeSummary.map((line) => [{ text: line, style: 'detailText' }]),
    },
    layout: {
      hLineColor: () => '#E2E8F0',
      vLineColor: () => '#E2E8F0',
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 16],
  });

  const detailsEn = (params.detailsEn ?? []).map((detail) => sanitizeString(detail));
  const detailsArSource = params.detailsAr ?? params.detailsEn ?? [];
  const detailsAr = detailsArSource.map((detail) => sanitizeString(detail));

  if (detailsEn.length || detailsAr.length) {

    content.push({

      columns: [

        {

          width: '*',

          stack: [

            { text: 'Details (EN)', style: 'sectionHeading', margin: [0, 0, 0, 6] } as Content,

            ...detailsEn.map((detail) => ({ text: detail, style: 'detailText', margin: [0, 0, 0, 4] } as Content)),

          ],

        },

        {

          width: '*',

          stack: [

            { text: 'Details (AR)', style: 'sectionHeading', alignment: 'right', margin: [0, 0, 0, 6] } as Content,

            ...detailsAr.map((detail) => ({ text: detail, style: 'detailText', alignment: 'right', margin: [0, 0, 0, 4] } as Content)),

          ],

        },

      ],

      columnGap: 24,

    } as Content);

  }

  return {
    info: { title: `${titleEn} - ${fullName}` },
    pageMargins: [40, 56, 40, 56],
    content,
    styles: {
      brand: { fontSize: 12, bold: true, color: secondaryColor, font: 'Amiri' },
      titleEn: { fontSize: 18, bold: true, color: titleColor, font: 'Amiri' },
      titleAr: { fontSize: 16, bold: true, color: titleColor, font: 'Amiri' },
      subheadingEn: { fontSize: 12, color: secondaryColor, font: 'Amiri' },
      subheadingAr: { fontSize: 12, color: secondaryColor, font: 'Amiri' },
      meta: { fontSize: 10, color: '#475569', font: 'Amiri' },
      bodyEn: { fontSize: 11, color: '#111827', font: 'Amiri' },
      bodyAr: { fontSize: 11, color: '#111827', alignment: 'right', font: 'Amiri' },
      sectionHeading: { fontSize: 11, bold: true, color: titleColor, font: 'Amiri' },
      detailText: { fontSize: 10, color: '#0F172A', font: 'Amiri' },
      muted: { fontSize: 9, color: '#64748B', font: 'Amiri' },
    },
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Amiri' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' | ');
        return [
          { text: contact ? `${left} | ${contact}` : left, style: 'muted' },
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









