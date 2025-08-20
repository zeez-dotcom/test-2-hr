import { describe, it, expect } from 'vitest';
import { parseBoolean, parseNumber, parseDateToISO } from './normalize';

describe('parseBoolean', () => {
  it('converts English boolean strings', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean('Yes')).toBe(true);
    expect(parseBoolean('No')).toBe(false);
  });

  it('converts Arabic boolean strings', () => {
    expect(parseBoolean('نعم')).toBe(true);
    expect(parseBoolean('لا')).toBe(false);
    expect(parseBoolean('صح')).toBe(true);
    expect(parseBoolean('خطأ')).toBe(false);
  });
});

describe('parseNumber', () => {
  it('handles exponential notation', () => {
    expect(parseNumber('1e3')).toBe(1000);
  });

  it('handles comma separated thousands and currency symbols', () => {
    expect(parseNumber('$1,234.56')).toBe(1234.56);
  });
});

describe('parseDateToISO', () => {
  it('errors on ambiguous day/month format', () => {
    const res = parseDateToISO('02/03/2020');
    expect(res.value).toBeNull();
    expect(res.error).toBe('Ambiguous date format');
  });
});
