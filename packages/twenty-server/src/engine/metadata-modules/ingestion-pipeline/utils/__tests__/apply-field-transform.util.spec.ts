import { applyFieldTransform } from 'src/engine/metadata-modules/ingestion-pipeline/utils/apply-field-transform.util';

describe('applyFieldTransform', () => {
  it('should return value unchanged when transform is null', () => {
    expect(applyFieldTransform('hello', null)).toBe('hello');
  });

  describe('uppercase', () => {
    it('should uppercase a string', () => {
      expect(applyFieldTransform('hello', { type: 'uppercase' })).toBe(
        'HELLO',
      );
    });

    it('should return non-string values unchanged', () => {
      expect(applyFieldTransform(42, { type: 'uppercase' })).toBe(42);
    });
  });

  describe('lowercase', () => {
    it('should lowercase a string', () => {
      expect(applyFieldTransform('HELLO', { type: 'lowercase' })).toBe(
        'hello',
      );
    });
  });

  describe('trim', () => {
    it('should trim whitespace', () => {
      expect(applyFieldTransform('  hello  ', { type: 'trim' })).toBe(
        'hello',
      );
    });
  });

  describe('map', () => {
    it('should map a value using the values table', () => {
      expect(
        applyFieldTransform('A', {
          type: 'map',
          values: { A: 'Approved', B: 'Declined' },
        }),
      ).toBe('Approved');
    });

    it('should return original value when no mapping exists', () => {
      expect(
        applyFieldTransform('C', {
          type: 'map',
          values: { A: 'Approved' },
        }),
      ).toBe('C');
    });
  });

  describe('numberScale', () => {
    it('should multiply a number value', () => {
      expect(
        applyFieldTransform(1.50, { type: 'numberScale', multiplier: 1000000 }),
      ).toBe(1500000);
    });

    it('should parse string numbers', () => {
      expect(
        applyFieldTransform('2.5', {
          type: 'numberScale',
          multiplier: 100,
        }),
      ).toBe(250);
    });

    it('should return original for non-numeric values', () => {
      expect(
        applyFieldTransform('abc', { type: 'numberScale', multiplier: 100 }),
      ).toBe('abc');
    });
  });

  describe('sanitizeNull', () => {
    it('should convert null-like values to null', () => {
      expect(applyFieldTransform(null, { type: 'sanitizeNull' })).toBeNull();
      expect(applyFieldTransform('', { type: 'sanitizeNull' })).toBeNull();
      expect(applyFieldTransform('null', { type: 'sanitizeNull' })).toBeNull();
      expect(applyFieldTransform('NULL', { type: 'sanitizeNull' })).toBeNull();
      expect(applyFieldTransform('None', { type: 'sanitizeNull' })).toBeNull();
      expect(
        applyFieldTransform('undefined', { type: 'sanitizeNull' }),
      ).toBeNull();
    });

    it('should leave non-null values unchanged', () => {
      expect(applyFieldTransform('hello', { type: 'sanitizeNull' })).toBe(
        'hello',
      );
      expect(applyFieldTransform(0, { type: 'sanitizeNull' })).toBe(0);
    });
  });

  describe('dateFormat', () => {
    it('should convert unix timestamps', () => {
      const result = applyFieldTransform(1700000000, {
        type: 'dateFormat',
        sourceFormat: 'unix',
      });

      expect(result).toBe(new Date(1700000000 * 1000).toISOString());
    });

    it('should convert unix_ms timestamps', () => {
      const result = applyFieldTransform(1700000000000, {
        type: 'dateFormat',
        sourceFormat: 'unix_ms',
      });

      expect(result).toBe(new Date(1700000000000).toISOString());
    });

    it('should parse standard date strings', () => {
      const result = applyFieldTransform('2024-01-15', {
        type: 'dateFormat',
        sourceFormat: 'iso',
      });

      expect(result).toBe(new Date('2024-01-15').toISOString());
    });
  });

  describe('phoneNormalize', () => {
    it('should normalize a US phone number', () => {
      const result = applyFieldTransform('(555) 123-4567', {
        type: 'phoneNormalize',
      });

      expect(result).toBe('+15551234567');
    });

    it('should return empty strings unchanged', () => {
      expect(applyFieldTransform('', { type: 'phoneNormalize' })).toBe('');
    });

    it('should return non-string values unchanged', () => {
      expect(applyFieldTransform(123, { type: 'phoneNormalize' })).toBe(123);
    });
  });
});
