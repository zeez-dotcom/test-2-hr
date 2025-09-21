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

const SCIENTIFIC_NOTATION_REGEX = /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i;

export function normalizeBigId(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') {
    return Math.trunc(v).toString();
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return undefined;
    if (SCIENTIFIC_NOTATION_REGEX.test(t)) {
      const num = Number(t);
      if (Number.isFinite(num)) {
        return Math.trunc(num).toString();
      }
    }
    return t;
  }
  return undefined;
}

export const headerDictionary: Record<string, string> = {
  'employee code': 'employeeCode',
  'employee id': 'employeeCode',
  'code': 'employeeCode',
  'id': 'employeeCode',
  'معرف': 'employeeCode',
  'معرف الموظف': 'employeeCode',

  'english name': 'englishName',
  'اسم الانجليزي': 'englishName',

  'first name': 'firstName',
  'first name (english)': 'firstName',
  'الاسم الأول': 'firstName',
  'الاسم الاول': 'firstName',

  'last name': 'lastName',
  'family name': 'lastName',
  'اسم العائلة': 'lastName',
  'الاسم الأخير': 'lastName',

  'arabic name': 'arabicName',
  'الاسم العربي': 'arabicName',
  'اسم المؤظف': 'arabicName',
  'اسم الموظف': 'arabicName',

  'nickname': 'nickname',

  'job title': 'position',
  'position': 'position',
  'لقب': 'position',
  'المسمى الوظيفي': 'position',

  'work location': 'workLocation',
  'مكان العمل': 'workLocation',

  'nationality': 'nationality',
  'الجنسية': 'nationality',

  'profession': 'profession',
  'المهنة': 'profession',

  'profession code': 'professionCode',
  'رمز المهنة': 'professionCode',

  'profession category': 'professionCategory',
  'تصنيف المهنة': 'professionCategory',

  'department id': 'departmentId',
  'department': 'departmentId',
  'قسم': 'departmentId',
  'معرف القسم': 'departmentId',
  'profession department': 'departmentId',

  'employment date': 'startDate',
  'start date': 'startDate',
  'تاريخ التوظيف': 'startDate',

  'status': 'status',
  'الحالة': 'status',

  'civil id number': 'civilId',
  'رقم البطاقة المدنية': 'civilId',

  'civil id issue date': 'civilIdIssueDate',
  'تاريخ اصدار البطاقة المدنية': 'civilIdIssueDate',
  'تاريخ إصدار البطاقة المدنية': 'civilIdIssueDate',

  'civil id expiry date': 'civilIdExpiryDate',
  'تاريخ انتهاء البطاقة المدنية': 'civilIdExpiryDate',

  'civil id alert days': 'civilIdAlertDays',

  'passport number': 'passportNumber',
  'رقم جواز السفر': 'passportNumber',

  'passport issue date': 'passportIssueDate',
  'تاريخ اصدار جواز السفر': 'passportIssueDate',
  'تاريخ إصدار جواز السفر': 'passportIssueDate',

  'passport expiry date': 'passportExpiryDate',
  'تاريخ انتهاء جواز السفر': 'passportExpiryDate',

  'passport alert days': 'passportAlertDays',

  'salary': 'salary',
  'salaries': 'salary',
  'الراتب': 'salary',

  'additions': 'additions',
  'إضافات': 'additions',

  'payment method': 'paymentMethod',
  'طريقة الدفع': 'paymentMethod',

  'transferable': 'transferable',
  'تحويل': 'transferable',

  'standard working days': 'standardWorkingDays',
  'days worked': 'standardWorkingDays',
  'working days': 'standardWorkingDays',
  'أيام العمل': 'standardWorkingDays',

  'phone': 'phone',
  'phone number': 'phone',
  'phonenumber': 'phone',
  'رقم الهاتف': 'phone',

  'email': 'email',

  'emergency contact': 'emergencyContact',
  'emergency phone': 'emergencyPhone',
  'emergency number': 'emergencyPhone',

  'national id': 'nationalId',
  'address': 'address',
  'date of birth': 'dateOfBirth',
  'birth date': 'dateOfBirth',

  'image url': 'profileImage',
  'profile image': 'profileImage',
  'profile image url': 'profileImage',
  'profile picture': 'profileImage',
  'رابط الصورة': 'profileImage',
  'صورة الملف الشخصي': 'profileImage',

  'civil id image': 'civilIdImage',
  'civil id pic': 'civilIdImage',
  'صورة البطاقة المدنية': 'civilIdImage',

  'passport image': 'passportImage',
  'passport pic': 'passportImage',
  'صورة جواز السفر': 'passportImage',

  'driving license image': 'drivingLicenseImage',
  'driving license': 'drivingLicenseImage',
  'صورة رخصة القيادة': 'drivingLicenseImage',

  'driving license number': 'drivingLicenseNumber',

  'driving license issue date': 'drivingLicenseIssueDate',
  'تاريخ اصدار رخصة القيادة': 'drivingLicenseIssueDate',
  'تاريخ إصدار رخصة القيادة': 'drivingLicenseIssueDate',

  'driving license expiry date': 'drivingLicenseExpiryDate',
  'تاريخ انتهاء رخصة القيادة': 'drivingLicenseExpiryDate',

  'documents': 'otherDocs',
  'document': 'otherDocs',
  'مستندات': 'otherDocs',

  'other docs': 'additionalDocs',
  'additional documents': 'additionalDocs',
  'مستندات إضافية': 'additionalDocs',

  'iban': 'iban',
  'iban number': 'iban',
  'آيبان': 'iban',
  'bank iban': 'bankIban',
  'bank name': 'bankName',

  'swiftcode': 'swiftCode',
  'swift code': 'swiftCode',
  'رمز السويفت': 'swiftCode',

  'bank iban number': 'bankIban',

  'residency name': 'residencyName',
  'اسم الإقامة': 'residencyName',

  'residency on company or not': 'residencyOnCompany',
  'residency on company': 'residencyOnCompany',
  'الإقامة على الشركة': 'residencyOnCompany',

  'company': 'companyId',
  'company id': 'companyId',
  'company name': 'companyId',

  'visa number': 'visaNumber',
  'visa type': 'visaType',
  'visa issue date': 'visaIssueDate',
  'visa expiry date': 'visaExpiryDate',
  'visa alert days': 'visaAlertDays',
  'visa image': 'visaImage',

  'role': 'role',
};

export function mapHeader(header: string): string | undefined {
  const raw = header.trim();
  const candidates = [raw, ...raw.split('/'), ...raw.split('|')]
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  for (const key of candidates) {
    const mapped = headerDictionary[key];
    if (mapped) return mapped;
  }
  return undefined;
}
