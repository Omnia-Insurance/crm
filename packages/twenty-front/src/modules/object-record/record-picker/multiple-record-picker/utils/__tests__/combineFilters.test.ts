import { combineFilters } from '@/object-record/record-picker/multiple-record-picker/utils/combineFilters';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

describe('combineFilters', () => {
  it('should return undefined when all filters are undefined', () => {
    const result = combineFilters([undefined, undefined]);

    expect(result).toBeUndefined();
  });

  it('should return undefined for an empty array', () => {
    const result = combineFilters([]);

    expect(result).toBeUndefined();
  });

  it('should return the single filter when only one is defined', () => {
    const filter: ObjectRecordFilterInput = { id: { in: ['id-1', 'id-2'] } };

    const result = combineFilters([undefined, filter, undefined]);

    expect(result).toEqual(filter);
  });

  it('should combine multiple defined filters with and', () => {
    const filter1: ObjectRecordFilterInput = { id: { in: ['id-1'] } };
    const filter2: ObjectRecordFilterInput = {
      not: { id: { in: ['id-2'] } },
    };

    const result = combineFilters([filter1, filter2]);

    expect(result).toEqual({ and: [filter1, filter2] });
  });

  it('should filter out undefined and combine remaining filters', () => {
    const filter1: ObjectRecordFilterInput = { id: { in: ['id-1'] } };
    const filter2: ObjectRecordFilterInput = { id: { in: ['id-3'] } };

    const result = combineFilters([filter1, undefined, filter2]);

    expect(result).toEqual({ and: [filter1, filter2] });
  });
});
