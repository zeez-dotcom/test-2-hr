import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Company } from "@shared/schema"
import { queryClient } from "./queryClient"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const DEFAULT_CURRENCY_CODE = "KWD"
const DEFAULT_LOCALE = "en-KW"

type CurrencyConfig = {
  currency: string
  locale: string
}

let currencyConfigOverride: CurrencyConfig | null = null

export function setCurrencyConfigForTests(config: CurrencyConfig | null) {
  currencyConfigOverride = config
}

export function getCurrencyConfig(): CurrencyConfig {
  if (currencyConfigOverride) {
    return currencyConfigOverride
  }

  try {
    const company = queryClient.getQueryData<Company | undefined>(["/api/company"]) ?? undefined
    const currency = company?.currencyCode?.trim() || DEFAULT_CURRENCY_CODE
    const locale = company?.locale?.trim() || DEFAULT_LOCALE
    return { currency, locale }
  } catch {
    return { currency: DEFAULT_CURRENCY_CODE, locale: DEFAULT_LOCALE }
  }
}

export function getCurrencyCode(): string {
  return getCurrencyConfig().currency
}

export function formatCurrency(amount: number | string): string {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount
  const numeric = Number.isFinite(value) ? (value as number) : 0
  const { currency, locale } = getCurrencyConfig()
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(numeric)
}

export function formatAllowanceLabel(key: string): string {
  if (!key) {
    return 'Allowance';
  }

  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) {
    return 'Allowance';
  }

  const label = spaced
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return /\ballowance\b/i.test(label) ? label : `${label} Allowance`;
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

export function summarizeAllowances(
  allowances: Record<string, NumericLike> | null | undefined,
): {
  total: number;
  entries: Array<{ key: string; label: string; amount: number }>;
} {
  const entries = Object.entries(allowances ?? {})
    .map(([key, value]) => ({ key, amount: toNumericValue(value) }))
    .filter(({ amount }) => amount !== 0);

  const total = entries.reduce((sum, { amount }) => sum + amount, 0);

  return {
    total,
    entries: entries.map(({ key, amount }) => ({
      key,
      amount,
      label: formatAllowanceLabel(key),
    })),
  };
}

export function formatAllowanceSummaryForCsv(
  summaryOrAllowances:
    | ReturnType<typeof summarizeAllowances>
    | Record<string, NumericLike>
    | null
    | undefined,
): string {
  const summary =
    summaryOrAllowances &&
    typeof summaryOrAllowances === "object" &&
    "entries" in summaryOrAllowances
      ? (summaryOrAllowances as ReturnType<typeof summarizeAllowances>)
      : summarizeAllowances(
          summaryOrAllowances as Record<string, NumericLike> | null | undefined,
        );

  if (summary.entries.length === 0) {
    return "";
  }

  const parts: string[] = [];

  if (summary.entries.length > 1 && summary.total !== 0) {
    parts.push(`Total: ${formatCurrency(summary.total)}`);
  }

  parts.push(
    ...summary.entries.map(({ label, amount }) => `${label}: ${formatCurrency(amount)}`),
  );

  return parts.join("; ");
}

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
