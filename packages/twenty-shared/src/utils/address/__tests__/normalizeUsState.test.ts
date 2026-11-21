import { normalizeUsState } from '@/utils/address/normalizeUsState';

describe('normalizeUsState', () => {
  it('should map full state names to their code, ignoring case and spaces', () => {
    expect(normalizeUsState('Florida')).toBe('FL');
    expect(normalizeUsState('  new york ')).toBe('NY');
    expect(normalizeUsState('District of Columbia')).toBe('DC');
    expect(normalizeUsState('Guam')).toBe('GU');
  });

  it('should upper-case existing state codes', () => {
    expect(normalizeUsState('fl')).toBe('FL');
    expect(normalizeUsState('TX')).toBe('TX');
  });

  it('should return unrecognized values trimmed but unchanged', () => {
    expect(normalizeUsState(' Ontario ')).toBe('Ontario');
    expect(normalizeUsState('ZZ')).toBe('ZZ');
  });

  it('should return an empty string for blank or non-string values', () => {
    expect(normalizeUsState('   ')).toBe('');
    expect(normalizeUsState('')).toBe('');
    expect(normalizeUsState(null)).toBe('');
    expect(normalizeUsState(undefined)).toBe('');
    expect(normalizeUsState(12)).toBe('');
  });
});
