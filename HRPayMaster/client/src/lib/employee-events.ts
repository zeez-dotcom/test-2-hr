import type { EmployeeEvent } from "@shared/schema";

export type RecurrenceAwareEvent = Pick<
  EmployeeEvent,
  | "id"
  | "eventType"
  | "eventDate"
  | "amount"
  | "recurrenceType"
  | "recurrenceEndDate"
  | "affectsPayroll"
> &
  Record<string, unknown>;

type DateLike = string | Date | null | undefined;

type ExpandOptions = {
  rangeStart?: DateLike;
  rangeEnd?: DateLike;
};

const MAX_OCCURRENCES = 600;

function normalizeDate(value: DateLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toUTCDate(value);
  }
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return null;
    }
    return new Date(Date.UTC(y, m - 1, d));
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return toUTCDate(parsed);
}

function toUTCDate(value: Date): Date {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addMonthsUTC(date: Date, monthsToAdd: number, referenceDay: number): Date {
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthsToAdd, 1));
  const daysInMonth = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const finalDay = Math.min(Math.max(referenceDay || 1, 1), daysInMonth);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), finalDay));
}

function buildOccurrenceId(event: RecurrenceAwareEvent, dateIso: string): string {
  const base = typeof event.id === "string" && event.id.trim() ? event.id.trim() : `${event.eventType}`;
  return `${base}:${dateIso}`;
}

export function parseDateInput(value: DateLike): Date | null {
  return normalizeDate(value);
}

export function isRecurringMonthlyAllowance(event: RecurrenceAwareEvent): boolean {
  return event.eventType === "allowance" && event.recurrenceType === "monthly";
}

export function allowanceRecursInRange(
  event: RecurrenceAwareEvent,
  rangeStart: DateLike,
  rangeEnd: DateLike,
): boolean {
  if (!isRecurringMonthlyAllowance(event)) return false;
  const start = normalizeDate(rangeStart);
  const end = normalizeDate(rangeEnd);
  if (!start || !end) return false;
  const recurrenceStart = normalizeDate(event.eventDate);
  if (!recurrenceStart) return false;
  if (recurrenceStart > end) return false;
  const recurrenceEnd = normalizeDate(event.recurrenceEndDate);
  if (recurrenceEnd && recurrenceEnd < start) return false;
  return true;
}

export function expandRecurringAllowanceOccurrences<T extends RecurrenceAwareEvent>(
  event: T,
  options: ExpandOptions = {},
): Array<T & { eventDate: string; recurrenceOccurrenceId: string }> {
  if (!isRecurringMonthlyAllowance(event)) {
    const isoDate = typeof event.eventDate === "string" ? event.eventDate : formatDateISO(normalizeDate(event.eventDate));
    if (!isoDate) return [];
    return [
      {
        ...event,
        eventDate: isoDate,
        recurrenceOccurrenceId: buildOccurrenceId(event, isoDate),
      },
    ];
  }

  const recurrenceStart = normalizeDate(event.eventDate);
  if (!recurrenceStart) {
    return [];
  }

  const recurrenceEnd = normalizeDate(event.recurrenceEndDate);
  const providedStart = normalizeDate(options.rangeStart);
  const providedEnd = normalizeDate(options.rangeEnd);

  const effectiveStart = providedStart && providedStart > recurrenceStart ? providedStart : recurrenceStart;
  const defaultEnd = recurrenceEnd ?? todayUTC();
  let effectiveEnd: Date;
  if (providedEnd) {
    if (recurrenceEnd && recurrenceEnd < providedEnd) {
      effectiveEnd = recurrenceEnd;
    } else {
      effectiveEnd = providedEnd;
    }
  } else {
    effectiveEnd = defaultEnd;
  }

  if (effectiveEnd < effectiveStart) {
    return [];
  }

  const originalDay = recurrenceStart.getUTCDate() || 1;
  let occurrence = new Date(recurrenceStart.getTime());
  while (occurrence < effectiveStart) {
    occurrence = addMonthsUTC(occurrence, 1, originalDay);
    if (occurrence.getUTCFullYear() > effectiveEnd.getUTCFullYear() + 10) {
      break;
    }
  }

  const results: Array<T & { eventDate: string; recurrenceOccurrenceId: string }> = [];
  let safety = 0;
  while (occurrence <= effectiveEnd && safety < MAX_OCCURRENCES) {
    const iso = formatDateISO(occurrence);
    if (!iso) break;
    results.push({
      ...event,
      eventDate: iso,
      recurrenceOccurrenceId: buildOccurrenceId(event, iso),
    });
    occurrence = addMonthsUTC(occurrence, 1, originalDay);
    safety += 1;
  }

  return results;
}

export function expandEventsWithRecurringAllowances<T extends RecurrenceAwareEvent>(
  events: readonly T[],
  options: ExpandOptions = {},
): Array<T & { eventDate: string; recurrenceOccurrenceId: string }> {
  const expanded: Array<T & { eventDate: string; recurrenceOccurrenceId: string }> = [];
  for (const event of events) {
    if (isRecurringMonthlyAllowance(event)) {
      const occurrences = expandRecurringAllowanceOccurrences(event, options);
      if (occurrences.length > 0) {
        expanded.push(...occurrences);
      }
      continue;
    }
    const iso = typeof event.eventDate === "string" ? event.eventDate : formatDateISO(normalizeDate(event.eventDate));
    if (!iso) {
      continue;
    }
    expanded.push({
      ...event,
      eventDate: iso,
      recurrenceOccurrenceId: buildOccurrenceId(event, iso),
    });
  }
  return expanded;
}

function formatDateISO(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().split("T")[0] ?? null;
}

export function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

export function isDateWithinRange(value: DateLike, rangeStart: DateLike | undefined, rangeEnd: DateLike | undefined): boolean {
  const date = normalizeDate(value);
  if (!date) return false;
  const start = normalizeDate(rangeStart ?? undefined);
  const end = normalizeDate(rangeEnd ?? undefined);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}
