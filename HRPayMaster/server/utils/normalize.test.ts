import { describe, it, expect } from 'vitest';
import { parseBoolean } from './normalize';

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
