import { normalizeDiffComparableValue } from '@/reconciliation/utils/normalizeDiffComparableValue';

describe('normalizeDiffComparableValue', () => {
  it.each([null, undefined, ''])('treats %p as empty', (value) => {
    expect(normalizeDiffComparableValue(value)).toBeNull();
  });

  it('compares numbers by their string form, zero included', () => {
    expect(normalizeDiffComparableValue(2)).toBe('2');
    expect(normalizeDiffComparableValue(0)).toBe('0');
  });

  it('keeps non-empty strings and booleans as strings', () => {
    expect(normalizeDiffComparableValue('ACTIVE')).toBe('ACTIVE');
    expect(normalizeDiffComparableValue(false)).toBe('false');
  });
});
