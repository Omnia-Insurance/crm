import { getDefaultAdvancedFilterOperand } from '@/object-record/advanced-filter/utils/getDefaultAdvancedFilterOperand';
import { getRecordFilterOperands } from '@/object-record/record-filter/utils/getRecordFilterOperands';
import { RelationType, ViewFilterOperand } from 'twenty-shared/types';

describe('getDefaultAdvancedFilterOperand', () => {
  it('should default DATE fields to IS_RELATIVE', () => {
    expect(getDefaultAdvancedFilterOperand({ filterType: 'DATE' })).toBe(
      ViewFilterOperand.IS_RELATIVE,
    );
  });

  it('should default DATE_TIME fields to IS_RELATIVE', () => {
    expect(getDefaultAdvancedFilterOperand({ filterType: 'DATE_TIME' })).toBe(
      ViewFilterOperand.IS_RELATIVE,
    );
  });

  it('should keep the first available operand for non-date fields', () => {
    const filterType = 'TEXT';

    expect(getDefaultAdvancedFilterOperand({ filterType })).toBe(
      getRecordFilterOperands({ filterType })[0],
    );
  });

  // OMNIA-CUSTOM: one-to-many relation filters only check emptiness
  it('should default a one-to-many relation to IS_EMPTY', () => {
    expect(
      getDefaultAdvancedFilterOperand({
        filterType: 'RELATION',
        relationType: RelationType.ONE_TO_MANY,
      }),
    ).toBe(ViewFilterOperand.IS_EMPTY);
  });

  it('should keep the relation default for a many-to-one relation', () => {
    expect(
      getDefaultAdvancedFilterOperand({
        filterType: 'RELATION',
        relationType: RelationType.MANY_TO_ONE,
      }),
    ).toBe(getRecordFilterOperands({ filterType: 'RELATION' })[0]);
  });
});
