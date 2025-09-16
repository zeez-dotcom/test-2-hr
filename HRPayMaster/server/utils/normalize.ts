import * as XLSX from 'xlsx';

// empty -> undefined; trim strings
export function emptyToUndef<T>(v: T): T | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t || t === '-' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') {
      return undefined;
    }
    return t as any;
  }
  return v;
}

export function parseNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') {
    return isNaN(v) ? undefined : v;
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9eE+\-.]/g, '');
    if (!/[0-9]/.test(cleaned)) return undefined;
    const num = Number(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

export function parseBoolean(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
    return undefined;
  }
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    const truthy = ['y','yes','true','1','نعم','صح','صحيح','oui','si','sí','ja'];
    const falsy = ['n','no','false','0','لا','خطأ','غلط','non','nein'];
    if (truthy.includes(t)) return true;
    if (falsy.includes(t)) return false;
  }
  return undefined;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function parseDateToISO(
  v: unknown
): { value: string | null; error: string | null } {
  if (v === undefined || v === null) return { value: null, error: null };
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return { value: null, error: null };
    return {
      value: `${d.y.toString().padStart(4, '0')}-${pad(d.m)}-${pad(d.d)}`,
      error: null,
    };
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return { value: null, error: null };
    return { value: v.toISOString().slice(0, 10), error: null };
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (
      !t ||
      t === '-' ||
      t.toLowerCase() === 'n/a' ||
      t.toLowerCase() === 'null' ||
      t === '0'
    )
      return { value: null, error: null };
    if (/^\d+$/.test(t)) {
      const num = Number(t);
      const d = XLSX.SSF.parse_date_code(num);
      if (d)
        return {
          value: `${d.y.toString().padStart(4, '0')}-${pad(d.m)}-${pad(d.d)}`,
          error: null,
        };
    }
    const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [_, a, b, c] = m;
      if (c.length === 2) c = '20' + c;
      const iso1 = `${c.padStart(4, '0')}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      const iso2 = `${c.padStart(4, '0')}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
      const valid1 = !isNaN(Date.parse(iso1));
      const valid2 = !isNaN(Date.parse(iso2));
      if (valid1 && valid2 && iso1 !== iso2)
        return { value: null, error: 'Ambiguous date format' };
      if (valid1) return { value: iso1, error: null };
      if (valid2) return { value: iso2, error: null };
    }
    const parsed = Date.parse(t);
    if (!isNaN(parsed))
      return { value: new Date(parsed).toISOString().slice(0, 10), error: null };
    return { value: null, error: null };
  }
  return { value: null, error: null };
}

export function normalizeBigId(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') {
    return Math.trunc(v).toString();
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return undefined;
    if (/e/i.test(t)) {
      const num = Number(t);
      if (!isNaN(num)) return Math.trunc(num).toString();
      return t.replace(/\D/g, '');
    }
    return t;
  }
  return undefined;
}

export const headerDictionary: Record<string, string> = {
  'employee code': 'employeeCode',
  'code': 'employeeCode',
  'english name': 'englishName',
  'اسم الانجليزي': 'englishName',
  'arabic name': 'fullNameArabic',
  'اسم المؤظف': 'fullNameArabic',
  'job title': 'position',
  'لقب': 'position',
  'work location': 'workLocation',
  'مكان العمل': 'workLocation',
  'nationality': 'nationality',
  'الجنسية': 'nationality',
  'employment date': 'startDate',
  'تاريخ التوظيف': 'startDate',
  'status': 'status',
  'الحالة': 'status',
  'civil id number': 'civilId',
  'رقم البطاقة المدنية': 'civilId',
  'civil id issue date': 'civilIdIssueDate',
  'civil id expiry date': 'civilIdExpiryDate',
  'passport number': 'passportNumber',
  'رقم جواز السفر': 'passportNumber',
  'passport issue date': 'passportIssueDate',
  'passport expiry date': 'passportExpiryDate',
  'driving license expiry date': 'drivingLicenseExpiryDate',
  'salaries': 'salary',
  'رواتب': 'salary',
  'salary deductions': 'salaryDeductions',
  'خصومات الراتب': 'salaryDeductions',
  'additions': 'additions',
  'fines': 'fines',
  'total loans': 'totalLoans',
  'loans': 'loans',
  'payment method': 'paymentMethod',
  'طريقة الدفع': 'paymentMethod',
  'transferable': 'transferable',
  'تحويل': 'transferable',
  'phone': 'phone',
  'iban': 'iban',
  'swiftcode': 'swiftCode',
  'company': 'company',
  'image url': 'imageUrl',
  'رابط الصورة': 'imageUrl',
  'civil id pic': 'civilIdImage',
  'passport pic': 'passportImage',
  'driving license': 'drivingLicenseImage',
  'other docs': 'otherDocs',
  'vacation return date': 'vacationReturnDate',
  'residency on company or not': 'residencyOnCompany',
  'profession category': 'professionCategory',
  'swift code': 'swiftCode',
  'documents': 'otherDocs',
  'document': 'otherDocs',
  'profession code': 'professionCode',
  'profession': 'profession',
  'residency name': 'residencyName',
  'company vacation return date': 'vacationReturnDate',
  'id': 'employeeCode',
};

export function mapHeader(header: string): string | undefined {
  const key = header.trim().toLowerCase();
  return headerDictionary[key];
}

