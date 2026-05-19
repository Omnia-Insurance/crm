import { normalizeAddressCoordinate } from '~/utils/normalize-address-coordinate';

describe('normalizeAddressCoordinate', () => {
  it('should preserve finite numbers', () => {
    expect(normalizeAddressCoordinate(29.7417036)).toBe(29.7417036);
  });

  it('should parse decimal strings', () => {
    expect(normalizeAddressCoordinate(' -95.8759036 ')).toBe(-95.8759036);
  });

  it('should normalize empty values to null', () => {
    expect(normalizeAddressCoordinate(null)).toBeNull();
    expect(normalizeAddressCoordinate(undefined)).toBeNull();
    expect(normalizeAddressCoordinate('')).toBeNull();
  });

  it('should normalize invalid persisted coordinate strings to null', () => {
    expect(normalizeAddressCoordinate('null')).toBeNull();
    expect(normalizeAddressCoordinate('undefined')).toBeNull();
    expect(normalizeAddressCoordinate('29.7417036, -95.8759036')).toBeNull();
  });

  it('should normalize non-finite numbers to null', () => {
    expect(normalizeAddressCoordinate(Number.NaN)).toBeNull();
    expect(normalizeAddressCoordinate(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
