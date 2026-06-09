import { FieldMetadataType } from '../../../types/FieldMetadataType';
import { coerceFieldDiffValueForRecordUpdate } from '../coerceFieldDiffValueForRecordUpdate';

describe('coerceFieldDiffValueForRecordUpdate', () => {
  it('coerces numeric field diff strings to numbers', () => {
    expect(
      coerceFieldDiffValueForRecordUpdate('2', {
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toBe(2);
  });

  it('coerces numeric values when the current record value is a number', () => {
    expect(
      coerceFieldDiffValueForRecordUpdate('4.5', {
        currentValue: 1,
      }),
    ).toBe(4.5);
  });

  it('coerces empty numeric strings to null', () => {
    expect(
      coerceFieldDiffValueForRecordUpdate('', {
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toBeNull();
  });

  it('preserves non-numeric field diff strings', () => {
    expect(
      coerceFieldDiffValueForRecordUpdate('2', {
        fieldType: FieldMetadataType.TEXT,
      }),
    ).toBe('2');
  });

  it('leaves invalid numeric strings for record validation to reject', () => {
    expect(
      coerceFieldDiffValueForRecordUpdate('not-a-number', {
        fieldType: FieldMetadataType.NUMBER,
      }),
    ).toBe('not-a-number');
  });
});
