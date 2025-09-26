import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-KW', {
    style: 'currency',
    currency: 'KWD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(num);
}

type NumericLike = number | string | null | undefined;

const toNumericValue = (value: NumericLike): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export function calculateWorkingDaysAdjustment(entry: {
  baseSalary?: NumericLike;
  employee?: { salary?: NumericLike } | null;
  actualWorkingDays?: number | null;
  workingDays?: number | null;
}): number {
  const baseSalary = toNumericValue(entry.baseSalary);
  const fullSalarySource =
    entry.employee?.salary !== undefined && entry.employee?.salary !== null
      ? entry.employee.salary
      : entry.baseSalary;
  const fullSalary = toNumericValue(fullSalarySource);

  const difference = fullSalary - baseSalary;
  if (difference === 0) {
    return 0;
  }

  const actualDays = entry.actualWorkingDays ?? entry.workingDays;
  const standardDays = entry.workingDays ?? entry.actualWorkingDays;

  if (typeof actualDays === 'number' && typeof standardDays === 'number') {
    if (actualDays < standardDays) {
      return -Math.abs(difference);
    }

    if (actualDays > standardDays) {
      return Math.abs(difference);
    }
  }

  return difference;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

const DATA_URL_PATTERN = /^data:/i

export function isDataUrl(url?: string | null): boolean {
  if (typeof url !== 'string') {
    return false
  }
  return DATA_URL_PATTERN.test(url.trim())
}

export function getNewTabRel(url?: string | null): string | undefined {
  if (!url) {
    return undefined
  }
  return isDataUrl(url) ? 'noopener' : 'noopener noreferrer'
}

export function openUrlInNewTab(url?: string | null) {
  if (!url || typeof window === 'undefined') {
    return
  }
  const features = isDataUrl(url) ? 'noopener' : 'noopener,noreferrer'
  window.open(url, '_blank', features)
}
