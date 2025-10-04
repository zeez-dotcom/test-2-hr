import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableLayout } from 'pdfmake/interfaces';
import enLocale from '@/locales/en.json';
import arLocale from '@/locales/ar.json';
import { amiriRegularVfs, interRegularVfs, interSemiBoldVfs, interItalicVfs } from './font-vfs';
import { getBrand } from './brand';
import { sanitizeImageSrc } from './sanitizeImageSrc';

type PdfMakeWithRegistry = typeof pdfMake & {
  vfs?: Record<string, string>;
  fonts?: Record<string, { normal: string; bold?: string; italics?: string; bolditalics?: string }>;
  addFileToVFS?: (file: string, data: string) => void;
  addFonts?: (fonts: Record<string, { normal: string; bold?: string; italics?: string; bolditalics?: string }>) => void;
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
};

const fontsModule = pdfFonts as any;
const pdfMakeAny = pdfMake as PdfMakeWithRegistry;

if (typeof fontsModule === 'function') {
  fontsModule(pdfMake);
}

const moduleVfs: Record<string, string> =
  (fontsModule?.pdfMake?.vfs as Record<string, string>) ??
  (typeof fontsModule === 'object' ? (fontsModule as Record<string, string>) : {}) ??
  {};

function ensurePdfMakeFonts() {
  const root = pdfMakeAny as PdfMakeWithRegistry & { pdfMake?: PdfMakeWithRegistry };
  const vfs = (root.vfs ??= {});
  const nestedPdfMake = root.pdfMake;
  const nestedVfs = nestedPdfMake ? (nestedPdfMake.vfs ??= {}) : undefined;
  const vfsTargets = [vfs, nestedVfs].filter(Boolean) as Record<string, string>[];

  const syncTargets = (file: string, data: string) => {
    for (const target of vfsTargets) {
      if (target[file] !== data) {
        target[file] = data;
      }
    }
  };

  const registerFile = (file: string, data: string) => {
    const shouldRegister = vfs[file] !== data;
    if (shouldRegister && typeof pdfMakeAny.addFileToVFS === 'function') {
      pdfMakeAny.addFileToVFS(file, data);
    }
    syncTargets(file, data);
  };

  for (const [file, data] of Object.entries(moduleVfs)) {
    registerFile(file, data);
  }

  registerFile('Amiri-Regular.ttf', amiriRegularVfs);
  registerFile('Inter-Regular.ttf', interRegularVfs);
  registerFile('Inter-SemiBold.ttf', interSemiBoldVfs);
  registerFile('Inter-Italic.ttf', interItalicVfs);

  if (nestedVfs && nestedVfs !== vfs) {
    for (const [file, data] of Object.entries(vfs)) {
      if (nestedVfs[file] !== data) {
        nestedVfs[file] = data;
      }
    }
  }

  if (nestedPdfMake && nestedPdfMake.fonts !== pdfMakeAny.fonts) {
    nestedPdfMake.fonts = pdfMakeAny.fonts;
  }

  if (typeof pdfMakeAny.addVirtualFileSystem === 'function') {
    pdfMakeAny.addVirtualFileSystem(vfs);
  }

  const fonts = (pdfMakeAny.fonts ??= {});
  const robotoDefinition = {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  } as const;

  const needsRoboto =
    !fonts.Roboto ||
    fonts.Roboto.normal !== robotoDefinition.normal ||
    fonts.Roboto.bold !== robotoDefinition.bold ||
    fonts.Roboto.italics !== robotoDefinition.italics ||
    fonts.Roboto.bolditalics !== robotoDefinition.bolditalics;

  if (Object.keys(fonts).length === 0 || needsRoboto) {
    fonts.Roboto = { ...robotoDefinition };
  }
  const interDefinition = {
    normal: 'Inter-Regular.ttf',
    bold: 'Inter-SemiBold.ttf',
    italics: 'Inter-Italic.ttf',
    bolditalics: 'Inter-Italic.ttf',
  } as const;
  const amiriDefinition = {
    normal: 'Amiri-Regular.ttf',
    bold: 'Amiri-Regular.ttf',
    italics: 'Amiri-Regular.ttf',
    bolditalics: 'Amiri-Regular.ttf',
  } as const;

  const needsInter =
    !fonts.Inter ||
    fonts.Inter.normal !== interDefinition.normal ||
    fonts.Inter.bold !== interDefinition.bold ||
    fonts.Inter.italics !== interDefinition.italics ||
    fonts.Inter.bolditalics !== interDefinition.bolditalics;

  const needsAmiri =
    !fonts.Amiri ||
    fonts.Amiri.normal !== amiriDefinition.normal ||
    fonts.Amiri.bold !== amiriDefinition.bold ||
    fonts.Amiri.italics !== amiriDefinition.italics ||
    fonts.Amiri.bolditalics !== amiriDefinition.bolditalics;

  if (needsInter || needsAmiri || needsRoboto) {
    pdfMakeAny.fonts = {
      ...fonts,
      Roboto: fonts.Roboto ?? { ...robotoDefinition },
      Inter: { ...interDefinition },
      Amiri: { ...amiriDefinition },
    };

    if (typeof pdfMakeAny.addFonts === 'function') {
      pdfMakeAny.addFonts({
        Roboto: { ...robotoDefinition },
        Inter: { ...interDefinition },
        Amiri: { ...amiriDefinition },
      });
    }
  }
}

ensurePdfMakeFonts();

const originalCreatePdf = pdfMakeAny.createPdf.bind(pdfMakeAny) as typeof pdfMakeAny.createPdf;

pdfMakeAny.createPdf = ((docDefinition: TDocumentDefinitions, tableLayouts?: any, fonts?: any, vfs?: any) => {
  ensurePdfMakeFonts();
  return originalCreatePdf(docDefinition, tableLayouts, fonts, vfs);
}) as typeof pdfMakeAny.createPdf;
const UNSAFE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const sanitizeString = (value: string | null | undefined): string => {
  if (value == null) {
    return '';
  }

  const str = typeof value === 'string' ? value : String(value);
  return str.replace(UNSAFE_CONTROL_CHARS, '');
};

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

function formatYMD(value: string | Date | null | undefined, fallback = 'N/A'): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().split('T')[0];
}

const formatDisplayDate = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  return formatYMD(value, '-');
};

const formatCurrencyValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

type EmployeeFileLabels = {
  title: string;
  sections: {
    summary: string;
    events: string;
    loans: string;
    documents: string;
  };
  fields: {
    name: string;
    position: string;
    employeeId: string;
  };
  tables: {
    events: { title: string; date: string };
    loans: { amount: string; remaining: string; monthly: string; status: string };
    documents: { title: string; created: string };
  };
};

const defaultEmployeeFileLabels: Record<'en' | 'ar', EmployeeFileLabels> = {
  en: {
    title: 'Employee File Report',
    sections: {
      summary: 'Employee Summary',
      events: 'Events',
      loans: 'Loans',
      documents: 'Documents',
    },
    fields: {
      name: 'Name',
      position: 'Position',
      employeeId: 'Employee ID',
    },
    tables: {
      events: { title: 'Title', date: 'Date' },
      loans: { amount: 'Amount', remaining: 'Remaining', monthly: 'Monthly Deduction', status: 'Status' },
      documents: { title: 'Title', created: 'Created' },
    },
  },
  ar: {
    title: 'تقرير ملف الموظف',
    sections: {
      summary: 'ملخص الموظف',
      events: 'الأحداث',
      loans: 'القروض',
      documents: 'الوثائق',
    },
    fields: {
      name: 'الاسم',
      position: 'الوظيفة',
      employeeId: 'رقم الموظف',
    },
    tables: {
      events: { title: 'العنوان', date: 'التاريخ' },
      loans: { amount: 'المبلغ', remaining: 'المتبقي', monthly: 'القسط الشهري', status: 'الحالة' },
      documents: { title: 'العنوان', created: 'تاريخ الإنشاء' },
    },
  },
};

function mergeEmployeeFileLabels(
  base: EmployeeFileLabels,
  overrides?: Partial<EmployeeFileLabels>
): EmployeeFileLabels {
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    title: overrides.title ?? base.title,
    sections: { ...base.sections, ...(overrides.sections ?? {}) },
    fields: { ...base.fields, ...(overrides.fields ?? {}) },
    tables: {
      events: { ...base.tables.events, ...(overrides.tables?.events ?? {}) },
      loans: { ...base.tables.loans, ...(overrides.tables?.loans ?? {}) },
      documents: { ...base.tables.documents, ...(overrides.tables?.documents ?? {}) },
    },
  };
}

const employeeFileLabelsByLocale: Record<'en' | 'ar', EmployeeFileLabels> = {
  en: mergeEmployeeFileLabels(
    defaultEmployeeFileLabels.en,
    (enLocale as any)?.pdf?.employeeFile as Partial<EmployeeFileLabels> | undefined
  ),
  ar: mergeEmployeeFileLabels(
    defaultEmployeeFileLabels.ar,
    (arLocale as any)?.pdf?.employeeFile as Partial<EmployeeFileLabels> | undefined
  ),
};

type DualLabel = { en: string; ar: string };

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

export interface EmployeeProfileReportParams {
  employee: {
    firstName: string;
    lastName: string;
    position?: string | null;
    employeeCode?: string | null;
    departmentName?: string | null;
    companyName?: string | null;
    status?: string | null;
    startDate?: string | Date | null;
    workLocation?: string | null;
    email?: string | null;
    phone?: string | null;
    nationality?: string | null;
    salary?: number | null;
    additions?: number | null;
    profileImage?: string | null;
  };
  documents: Array<{
    label: string;
    number?: string | null;
    issueDate?: string | Date | null;
    expiryDate?: string | Date | null;
    alertDays?: number | null;
  }>;
  payrollHistory: Array<{
    period: string;
    grossPay?: number | null;
    deductions?: number | null;
    netPay?: number | null;
    components?: Array<{ label: string; value?: number | null }>;
  }>;
  events: Array<{
    title: string;
    type?: string | null;
    amount?: number | null;
    eventDate?: string | Date | null;
    description?: string | null;
  }>;
  loans: Array<{
    loanId: string;
    originalAmount?: number | null;
    remainingAmount?: number | null;
    monthlyDeduction?: number | null;
    deductionInRange?: number | null;
    status?: string | null;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    note?: string | null;
  }>;
  assets: Array<{
    name: string;
    type?: string | null;
    status?: string | null;
    assignedDate?: string | Date | null;
    returnDate?: string | Date | null;
    notes?: string | null;
  }>;
  cars: Array<{
    vehicle: string;
    plateNumber?: string | null;
    status?: string | null;
    assignedDate?: string | Date | null;
    returnDate?: string | Date | null;
    notes?: string | null;
  }>;
  vacations: Array<{
    type?: string | null;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    days?: number | null;
    status?: string | null;
    reason?: string | null;
  }>;
}

export function buildEmployeeReport(
  data: { employee: EmployeeLite; events: EmployeeEventLite[] }
): TDocumentDefinitions {
  const { employee, events } = data;
  const brand = getBrand();
  const brandName = sanitizeString(brand.name || 'HRPayMaster');
  const brandLogo = brand.logo ? sanitizeImageSrc(brand.logo) : undefined;
  const titleColor = brand.primaryColor || '#0F172A';
  const accentColor = brand.secondaryColor || titleColor;
  const firstName = sanitizeString(employee.firstName);
  const lastName = sanitizeString(employee.lastName);
  const position = employee.position ? sanitizeString(employee.position) : '';
  const id = sanitizeString(employee.id);
  const image = employee.profileImage ? sanitizeImageSrc(employee.profileImage) : undefined;
  const brandHeader: Content = {
    columns:
      brandLogo
        ? [
            { image: brandLogo, width: 64, height: 64, margin: [0, 0, 12, 0] },
            {
              stack: [
                { text: brandName, style: 'brandTitle' },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 2, lineColor: accentColor }] },
              ],
              margin: [0, 8, 0, 0],
            },
          ]
        : [
            {
              stack: [
                { text: brandName, style: 'brandTitle' },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 2, lineColor: accentColor }] },
              ],
            },
          ],
    columnGap: 12,
    margin: [0, 0, 0, 16],
  };
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
    brandHeader,
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
            formatYMD(e.eventDate)
          ]),
        ],
      },
      layout: tableLayout,
    },
  ];

  return {
    info: { title: `${firstName} ${lastName} Report` },
    pageMargins: [40, 56, 40, 56],
    content,
    styles: {
      brandTitle: { fontSize: 18, bold: true, color: titleColor },
      title: { fontSize: 20, bold: true, color: titleColor },
      section: { fontSize: 12, bold: true, color: titleColor, margin: [0, 14, 0, 6] },
      muted: { fontSize: 10, color: '#64748B' },
    },
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Inter' },
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
  language?: 'en' | 'ar';
}): TDocumentDefinitions {
  const { employee, events, loans, documents, language = 'en' } = params;
  const primaryLanguage: 'en' | 'ar' = language === 'ar' ? 'ar' : 'en';
  const secondaryLanguage: 'en' | 'ar' = primaryLanguage === 'en' ? 'ar' : 'en';
  const labels = employeeFileLabelsByLocale;

  const selectLabel = (selector: (locale: EmployeeFileLabels) => string): DualLabel => ({
    en: selector(labels.en),
    ar: selector(labels.ar),
  });

  type TextStyle = {
    fontSize?: number;
    bold?: boolean;
    color?: string;
    alignment?: 'left' | 'right' | 'center';
    lineHeight?: number;
  };

  const createText = (value: string, lang: 'en' | 'ar', style?: TextStyle): Content => {
    const sanitized = sanitizeString(value);
    if (!sanitized) {
      return { text: '' };
    }
    const { alignment, ...rest } = style ?? {};
    return {
      text: sanitized,
      font: lang === 'ar' ? 'Amiri' : 'Inter',
      alignment: alignment ?? (lang === 'ar' ? 'right' : 'left'),
      ...rest,
    } as Content;
  };

  const createBilingualTexts = (
    label: DualLabel,
    primaryStyle?: TextStyle,
    secondaryStyle?: TextStyle
  ): Content[] => {
    const parts: Content[] = [];
    const primaryValue = label[primaryLanguage];
    if (primaryValue) {
      parts.push(createText(primaryValue, primaryLanguage, primaryStyle));
    }
    if (secondaryLanguage !== primaryLanguage) {
      const secondaryValue = label[secondaryLanguage];
      if (secondaryValue) {
        parts.push(createText(secondaryValue, secondaryLanguage, secondaryStyle));
      }
    }
    return parts;
  };

  const createStack = (
    label: DualLabel,
    options?: {
      primaryStyle?: TextStyle;
      secondaryStyle?: TextStyle;
      margin?: [number, number, number, number];
    }
  ): Content => ({
    stack: createBilingualTexts(label, options?.primaryStyle, options?.secondaryStyle),
    margin: options?.margin ?? [0, 0, 0, 0],
  });

  const brand = getBrand();
  const brandName = sanitizeString(brand.name || 'HRPayMaster');
  const brandLogo = brand.logo ? sanitizeImageSrc(brand.logo) : undefined;
  const titleColor = brand.primaryColor || '#0F172A';
  const accentColor = brand.secondaryColor || titleColor;

  const firstName = sanitizeString(employee.firstName);
  const lastName = sanitizeString(employee.lastName);
  const fullName = `${firstName} ${lastName}`.trim();
  const position = employee.position ? sanitizeString(employee.position) : '';
  const employeeId = sanitizeString(employee.id);
  const profileImage = employee.profileImage ? sanitizeImageSrc(employee.profileImage) : undefined;

  const brandHeader: Content = {
    columns:
      brandLogo
        ? [
            { image: brandLogo, width: 64, height: 64, margin: [0, 0, 12, 0] },
            {
              stack: [
                { text: brandName, font: 'Inter', fontSize: 18, bold: true, color: titleColor },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 2, lineColor: accentColor }] },
              ],
              margin: [0, 8, 0, 0],
            },
          ]
        : [
            {
              stack: [
                { text: brandName, font: 'Inter', fontSize: 18, bold: true, color: titleColor },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 2, lineColor: accentColor }] },
              ],
            },
          ],
    columnGap: 12,
    margin: [0, 0, 0, 16],
  };

  const titleBlock = createStack(selectLabel(l => l.title), {
    primaryStyle: { fontSize: 20, bold: true, color: titleColor },
    secondaryStyle: { fontSize: 18, color: '#475569' },
    margin: [0, 0, 0, 12],
  });

  const summaryLabel = createStack(selectLabel(l => l.sections.summary), {
    primaryStyle: { fontSize: 12, bold: true, color: titleColor },
    secondaryStyle: { fontSize: 11, color: '#475569' },
    margin: [0, 0, 0, 6],
  });

  const summaryItems: Content[] = [];
  const summaryPairs: Array<{ label: DualLabel; value: string | null }> = [
    { label: selectLabel(l => l.fields.name), value: fullName || null },
    { label: selectLabel(l => l.fields.position), value: position || null },
    { label: selectLabel(l => l.fields.employeeId), value: employeeId || null },
  ];

  for (const pair of summaryPairs) {
    if (!pair.value) continue;
    summaryItems.push(
      createStack(
        {
          en: `${pair.label.en}: ${pair.value}`,
          ar: `${pair.label.ar}: ${pair.value}`,
        },
        {
          primaryStyle: { fontSize: 10, color: '#111827' },
          secondaryStyle: { fontSize: 10, color: '#111827' },
          margin: [0, 0, 0, 2],
        }
      )
    );
  }

  const headerRowImage: Content = {
    columns: [
      profileImage ? { image: profileImage, width: 56, height: 56, margin: [0, 0, 10, 0] } : { text: '' },
      {
        stack: summaryItems,
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 12],
  };

  const sectionHeader = (
    selector: (labels: EmployeeFileLabels) => string,
    options?: { margin?: [number, number, number, number]; pageBreak?: boolean }
  ): Content => {
    const block = createStack(selectLabel(selector), {
      primaryStyle: { fontSize: 12, bold: true, color: titleColor },
      secondaryStyle: { fontSize: 11, color: '#475569' },
      margin: options?.margin ?? [0, 16, 0, 6],
    });
    if (options?.pageBreak) {
      (block as any).pageBreak = 'before';
    }
    return block;
  };

  const headerCell = (label: DualLabel): Content => ({
    stack: createBilingualTexts(label, { fontSize: 10, bold: true, color: titleColor }, { fontSize: 9, color: '#1F2937' }),
    margin: [0, 2, 0, 2],
  });

  const tableLayout: TableLayout = {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F8FAFC' : rowIndex % 2 === 0 ? '#F1F5F9' : null),
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };

  const eventsBody: any[] = [
    [headerCell(selectLabel(l => l.tables.events.title)), headerCell(selectLabel(l => l.tables.events.date))],
    ...events.map(event => [
      sanitizeString(event.title),
      formatYMD(event.eventDate, ''),
    ]),
  ];

  const loansBody: any[] = [
    [
      headerCell(selectLabel(l => l.tables.loans.amount)),
      headerCell(selectLabel(l => l.tables.loans.remaining)),
      headerCell(selectLabel(l => l.tables.loans.monthly)),
      headerCell(selectLabel(l => l.tables.loans.status)),
    ],
    ...loans.map(loan => [
      sanitizeString(loan.amount),
      sanitizeString(loan.remainingAmount),
      sanitizeString(loan.monthlyDeduction),
      sanitizeString(loan.status),
    ]),
  ];

  const documentsBody: any[] = [
    [headerCell(selectLabel(l => l.tables.documents.title)), headerCell(selectLabel(l => l.tables.documents.created))],
    ...documents.map(doc => [
      sanitizeString(doc.title),
      formatYMD(doc.createdAt, ''),
    ]),
  ];

  const content: Content[] = [brandHeader, titleBlock, summaryLabel, headerRowImage];

  content.push(sectionHeader(l => l.sections.events, { margin: [0, 12, 0, 6] }));
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto'],
      body: eventsBody,
    },
    layout: tableLayout,
  });

  const loansSectionHeader = sectionHeader(l => l.sections.loans, { pageBreak: events.length > 0, margin: [0, 16, 0, 6] });
  content.push(loansSectionHeader);
  content.push({
    table: {
      headerRows: 1,
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: loansBody,
    },
    layout: tableLayout,
  });

  content.push(sectionHeader(l => l.sections.documents, { margin: [0, 16, 0, 6] }));
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto'],
      body: documentsBody,
    },
    layout: tableLayout,
  });

  return {
    info: { title: `${fullName || employeeId} ${labels.en.title}`.trim() },
    pageMargins: [40, 56, 40, 56],
    content,
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Inter' },
    footer: (currentPage: number, pageCount: number) => ({
      columns: ((): any[] => {
        const left = brand.name || 'HRPayMaster';
        const contact = [brand.website, brand.phone, brand.email].filter(Boolean).join(' | ');
        return [
          { text: contact ? `${left} | ${contact}` : left, color: '#64748B', fontSize: 9, font: 'Inter' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', color: '#64748B', fontSize: 9, font: 'Inter' },
        ];
      })(),
      margin: [40, 0, 40, 20],
    }),
  };
}

export function buildEmployeeProfileReport(data: EmployeeProfileReportParams): TDocumentDefinitions {
  const employee = data.employee;
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  const brand = getBrand();
  const titleColor = brand.primaryColor || '#0F172A';
  const profileImage = employee.profileImage ? sanitizeImageSrc(employee.profileImage) : undefined;

  const tableLayout: TableLayout = {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F8FAFC' : rowIndex % 2 === 0 ? '#F1F5F9' : null),
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };

  const buildKeyValueStack = (pairs: Array<{ label: string; value?: string | number | null }>) =>
    pairs
      .filter(pair => pair.value !== null && pair.value !== undefined && pair.value !== '')
      .map(pair => ({
        text:
          typeof pair.value === 'number'
            ? `${pair.label}: ${formatCurrencyValue(pair.value)}`
            : `${pair.label}: ${pair.value}`,
        style: 'detailText',
        margin: [0, 0, 0, 2],
      }));

  const employmentDetails = buildKeyValueStack([
    { label: 'Employee Code', value: employee.employeeCode },
    { label: 'Position', value: employee.position },
    { label: 'Department', value: employee.departmentName },
    { label: 'Company', value: employee.companyName },
    { label: 'Status', value: employee.status },
    { label: 'Start Date', value: employee.startDate ? formatDisplayDate(employee.startDate) : null },
    { label: 'Work Location', value: employee.workLocation },
  ]);

  const contactDetails = buildKeyValueStack([
    { label: 'Email', value: employee.email },
    { label: 'Phone', value: employee.phone },
    { label: 'Nationality', value: employee.nationality },
    { label: 'Salary', value: employee.salary ?? null },
    { label: 'Additions', value: employee.additions ?? null },
  ]);

  const content: any[] = [];

  content.push({
    columns: [
      profileImage
        ? { image: profileImage, width: 70, height: 70, margin: [0, 0, 16, 0] }
        : {
            width: 70,
            height: 70,
            canvas: [
              { type: 'rect', x: 0, y: 0, w: 70, h: 70, r: 8, color: '#E2E8F0' },
              {
                type: 'text',
                text: fullName ? fullName[0]?.toUpperCase() ?? '' : '',
                color: '#475569',
                fontSize: 22,
                x: 35,
                y: 35,
                alignment: 'center',
              },
            ],
            margin: [0, 0, 16, 0],
          },
      {
        width: '*',
        stack: [
          { text: fullName || 'Employee Profile', style: 'title' },
          employee.position ? { text: employee.position, style: 'muted', margin: [0, 2, 0, 0] } : null,
          employee.departmentName ? { text: employee.departmentName, style: 'muted' } : null,
        ].filter(Boolean),
      },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 16],
  });

  content.push({
    layout: 'noBorders',
    table: {
      widths: ['*', '*'],
      body: [
        [
          {
            stack: [{ text: 'Employment Overview', style: 'sectionHeading' }, ...employmentDetails],
          },
          {
            stack: [{ text: 'Contact & Compensation', style: 'sectionHeading' }, ...contactDetails],
          },
        ],
      ],
    },
  });

  const addTableSection = (
    heading: string,
    headers: string[],
    rows: any[][],
    emptyMessage: string,
  ) => {
    content.push({ text: heading, style: 'sectionHeading', margin: [0, 16, 0, 6] });
    if (!rows.length) {
      content.push({ text: emptyMessage, style: 'muted' });
      return;
    }
    content.push({
      table: {
        headerRows: 1,
        widths: Array(headers.length).fill('*'),
        body: [headers, ...rows],
      },
      layout: tableLayout,
    });
  };

  const documentRows = data.documents.map(doc => [
    doc.label,
    doc.number || '-',
    formatDisplayDate(doc.issueDate),
    formatDisplayDate(doc.expiryDate),
    doc.alertDays !== null && doc.alertDays !== undefined ? `${doc.alertDays} days` : '-',
  ]);
  addTableSection('Document Summary', ['Document', 'Number', 'Issued', 'Expires', 'Alert'], documentRows, 'No document data available.');

  const payrollRows = data.payrollHistory.map(item => {
    const breakdown = (item.components || [])
      .filter(component => component.value !== null && component.value !== undefined && !Number.isNaN(component.value))
      .map(component => `${component.label}: ${formatCurrencyValue(component.value || 0)}`)
      .join('\n');
    return [
      item.period,
      formatCurrencyValue(item.grossPay ?? null),
      formatCurrencyValue(item.deductions ?? null),
      formatCurrencyValue(item.netPay ?? null),
      breakdown || '-',
    ];
  });
  addTableSection('Payroll History', ['Period', 'Gross Pay', 'Deductions', 'Net Pay', 'Breakdown'], payrollRows, 'No payroll history found for the selected period.');

  const loanRows = data.loans.map(loan => [
    loan.loanId,
    formatCurrencyValue(loan.originalAmount ?? null),
    formatCurrencyValue(loan.remainingAmount ?? null),
    formatCurrencyValue(loan.monthlyDeduction ?? null),
    formatCurrencyValue(loan.deductionInRange ?? null),
    loan.status || '-',
    formatDisplayDate(loan.startDate),
    formatDisplayDate(loan.endDate),
    loan.note || '-',
  ]);
  addTableSection(
    'Loans',
    ['Loan', 'Original', 'Remaining', 'Monthly', 'Deduction (Period)', 'Status', 'Start', 'End', 'Notes'],
    loanRows,
    'No loan records for this employee during the selected period.',
  );

  const eventRows = data.events.map(event => [
    formatDisplayDate(event.eventDate),
    event.type || '-',
    event.title || '-',
    formatCurrencyValue(event.amount ?? null),
    event.description || '-',
  ]);
  addTableSection('Payroll-affecting Events', ['Date', 'Type', 'Title', 'Amount', 'Description'], eventRows, 'No payroll events recorded for this employee.');

  const assetRows = data.assets.map(asset => [
    asset.name,
    asset.type || '-',
    formatDisplayDate(asset.assignedDate),
    formatDisplayDate(asset.returnDate),
    asset.status || '-',
    asset.notes || '-',
  ]);
  addTableSection('Asset Assignments', ['Asset', 'Type', 'Assigned', 'Returned', 'Status', 'Notes'], assetRows, 'No asset assignments found.');

  const carRows = data.cars.map(car => [
    car.vehicle,
    car.plateNumber || '-',
    formatDisplayDate(car.assignedDate),
    formatDisplayDate(car.returnDate),
    car.status || '-',
    car.notes || '-',
  ]);
  addTableSection('Fleet Assignments', ['Vehicle', 'Plate', 'Assigned', 'Returned', 'Status', 'Notes'], carRows, 'No fleet assignments found.');

  const vacationRows = data.vacations.map(vacation => [
    vacation.type || '-',
    formatDisplayDate(vacation.startDate),
    formatDisplayDate(vacation.endDate),
    vacation.days !== null && vacation.days !== undefined ? `${vacation.days}` : '-',
    vacation.status || '-',
    vacation.reason || '-',
  ]);
  addTableSection('Vacation Requests', ['Type', 'Start', 'End', 'Days', 'Status', 'Reason'], vacationRows, 'No vacation requests recorded.');

  return {
    info: { title: `${fullName || 'Employee'} Profile Report` },
    pageMargins: [40, 56, 40, 56],
    content,
    styles: {
      title: { fontSize: 22, bold: true, color: titleColor, font: 'Inter' },
      sectionHeading: { fontSize: 12, bold: true, color: titleColor, margin: [0, 0, 0, 6], font: 'Inter' },
      detailText: { fontSize: 10, color: '#0F172A', font: 'Inter' },
      muted: { fontSize: 9, color: '#64748B', font: 'Inter' },
    },
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Inter' },
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
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Inter' },
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
  ensurePdfMakeFonts();
  const sanitized = sanitize(docDefinition) as TDocumentDefinitions;
  pdfMake.createPdf(sanitized).open();
}

export function pdfBuffer(docDefinition: TDocumentDefinitions): Promise<Uint8Array> {
  ensurePdfMakeFonts();
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


type BilingualLabel = { en: string; ar: string };

export interface BilingualReceiptLabels {
  meta?: {
    documentNumber?: BilingualLabel;
    issuedDate?: BilingualLabel;
  };
  employeeSummary?: {
    name?: BilingualLabel;
    code?: BilingualLabel;
    id?: BilingualLabel;
    phone?: BilingualLabel;
    position?: BilingualLabel;
  };
  sections?: {
    detailsEn?: string;
    detailsAr?: string;
  };
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
    employeeCode?: string | null;
    profileImage?: string | null;
  };
  detailsEn: string[];
  detailsAr: string[];
  bodyEn?: string;
  bodyAr?: string;
  logo?: string | null;
  docNumber?: string;
  issuedDate?: string;
  labels?: BilingualReceiptLabels;
}): TDocumentDefinitions {
  const brand = getBrand();
  const logo = params.logo ?? brand.logo ?? null;
  const titleColor = brand.primaryColor || '#0F172A';
  const secondaryColor = brand.secondaryColor || '#334155';
  const docNo = params.docNumber ?? controllerNumber();
  const issued = params.issuedDate ?? new Date().toISOString().slice(0, 10);

  const sanitizeLabel = (value: BilingualLabel | undefined, fallback: string): BilingualLabel => ({
    en: sanitizeString(value?.en ?? fallback),
    ar: sanitizeString(value?.ar ?? value?.en ?? fallback),
  });

  const metaLabels = {
    documentNumber: sanitizeLabel(params.labels?.meta?.documentNumber, 'Document No'),
    issuedDate: sanitizeLabel(params.labels?.meta?.issuedDate, 'Issued'),
  };

  const employeeSummaryLabels = {
    name: sanitizeLabel(params.labels?.employeeSummary?.name, 'Employee'),
    code: sanitizeLabel(params.labels?.employeeSummary?.code, 'Employee Code'),
    id: sanitizeLabel(params.labels?.employeeSummary?.id, 'Employee ID'),
    phone: sanitizeLabel(params.labels?.employeeSummary?.phone, 'Phone'),
    position: sanitizeLabel(params.labels?.employeeSummary?.position, 'Position'),
  };

  const sectionLabels = {
    detailsEn: sanitizeString(params.labels?.sections?.detailsEn ?? 'Details (EN)'),
    detailsAr: sanitizeString(params.labels?.sections?.detailsAr ?? 'Details (AR)'),
  };

  const fullName = `${sanitizeString(params.employee.firstName)} ${sanitizeString(params.employee.lastName)}`.trim();
  const employeeId = sanitizeString(params.employee.id);
  const employeePhone = params.employee.phone ? sanitizeString(params.employee.phone) : null;
  const employeePosition = params.employee.position ? sanitizeString(params.employee.position) : null;
  const employeeCode = params.employee.employeeCode ? sanitizeString(params.employee.employeeCode) : null;
  const profileImage = params.employee.profileImage ? sanitizeImageSrc(params.employee.profileImage) : null;

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
      {
        width: '*',
        stack: [
          { text: `${metaLabels.documentNumber.en}: ${docNo}`, style: 'meta' } as Content,
          { text: `${metaLabels.documentNumber.ar}: ${docNo}`, style: 'metaAr', alignment: 'right' } as Content,
        ],
      },
      {
        width: '*',
        stack: [
          { text: `${metaLabels.issuedDate.en}: ${issued}`, style: 'meta', alignment: 'right' } as Content,
          { text: `${metaLabels.issuedDate.ar}: ${issued}`, style: 'metaAr', alignment: 'right' } as Content,
        ],
      },
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

  const employeeSummary: BilingualLabel[] = [
    { en: `${employeeSummaryLabels.name.en}: ${fullName}`, ar: `${employeeSummaryLabels.name.ar}: ${fullName}` },
    {
      en: `${employeeSummaryLabels.code.en}: ${employeeCode || 'N/A'}`,
      ar: `${employeeSummaryLabels.code.ar}: ${employeeCode || 'N/A'}`,
    },
    { en: `${employeeSummaryLabels.id.en}: ${employeeId}`, ar: `${employeeSummaryLabels.id.ar}: ${employeeId}` },
  ];
  if (employeePhone) {
    employeeSummary.push({
      en: `${employeeSummaryLabels.phone.en}: ${employeePhone}`,
      ar: `${employeeSummaryLabels.phone.ar}: ${employeePhone}`,
    });
  }
  if (employeePosition) {
    employeeSummary.push({
      en: `${employeeSummaryLabels.position.en}: ${employeePosition}`,
      ar: `${employeeSummaryLabels.position.ar}: ${employeePosition}`,
    });
  }

  const summaryTable: Content = {
    table: {
      widths: ['*'],
      body: employeeSummary.map((line) => [
        {
          stack: [
            { text: line.en, style: 'detailText' } as Content,
            { text: line.ar, style: 'detailTextAr', alignment: 'right' } as Content,
          ],
        },
      ]),
    },
    layout: {
      hLineColor: () => '#E2E8F0',
      vLineColor: () => '#E2E8F0',
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  };

  if (profileImage) {
    content.push({
      columns: [
        { image: profileImage, width: 96, height: 96, margin: [0, 0, 16, 0] },
        { ...summaryTable, margin: [0, 0, 0, 16] } as Content,
      ],
      columnGap: 16,
      margin: [0, 0, 0, 16],
    });
  } else {
    content.push({ ...summaryTable, margin: [0, 0, 0, 16] } as Content);
  }

  const detailsEn = (params.detailsEn ?? []).map((detail) => sanitizeString(detail));
  const detailsArSource = params.detailsAr ?? params.detailsEn ?? [];
  const detailsAr = detailsArSource.map((detail) => sanitizeString(detail));

  if (detailsEn.length || detailsAr.length) {

    content.push({

      columns: [

        {

          width: '*',

          stack: [

            { text: sectionLabels.detailsEn, style: 'sectionHeading', margin: [0, 0, 0, 6] } as Content,

            ...detailsEn.map((detail) => ({ text: detail, style: 'detailText', margin: [0, 0, 0, 4] } as Content)),

          ],

        },

        {

          width: '*',

          stack: [

            { text: sectionLabels.detailsAr, style: 'sectionHeadingAr', alignment: 'right', margin: [0, 0, 0, 6] } as Content,

            ...detailsAr.map((detail) => ({ text: detail, style: 'detailTextAr', alignment: 'right', margin: [0, 0, 0, 4] } as Content)),

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
      brand: { fontSize: 12, bold: true, color: secondaryColor, font: 'Inter' },
      titleEn: { fontSize: 18, bold: true, color: titleColor, font: 'Inter' },
      titleAr: { fontSize: 16, bold: true, color: titleColor, font: 'Amiri' },
      subheadingEn: { fontSize: 12, color: secondaryColor, font: 'Inter' },
      subheadingAr: { fontSize: 12, color: secondaryColor, font: 'Amiri' },
      meta: { fontSize: 10, color: '#475569', font: 'Inter' },
      metaAr: { fontSize: 10, color: '#475569', font: 'Amiri' },
      bodyEn: { fontSize: 11, color: '#111827', font: 'Inter' },
      bodyAr: { fontSize: 11, color: '#111827', alignment: 'right', font: 'Amiri' },
      sectionHeading: { fontSize: 11, bold: true, color: titleColor, font: 'Inter' },
      sectionHeadingAr: { fontSize: 11, bold: true, color: titleColor, font: 'Amiri', alignment: 'right' },
      detailText: { fontSize: 10, color: '#0F172A', font: 'Inter' },
      detailTextAr: { fontSize: 10, color: '#0F172A', font: 'Amiri', alignment: 'right' },
      muted: { fontSize: 9, color: '#64748B', font: 'Inter' },
    },
    defaultStyle: { fontSize: 10, color: '#111827', font: 'Inter' },
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
