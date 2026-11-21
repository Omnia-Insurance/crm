import { normalizeRequiredConditionRecord } from '@/object-record/record-form/utils/normalizeRequiredConditionRecord';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');

describe('normalizeRequiredConditionRecord', () => {
  it('reads a many-to-one relation from its join column', () => {
    expect(
      normalizeRequiredConditionRecord({
        record: {
          name: 'Deal',
          pointOfContactId: 'person-id',
          companyId: null,
        },
        fieldMetadataItems: opportunity.fields,
      }),
    ).toEqual({
      name: 'Deal',
      pointOfContactId: 'person-id',
      pointOfContact: { id: 'person-id' },
      companyId: null,
      company: null,
    });
  });

  it('keeps a relation the record already holds and leaves absent ones out', () => {
    expect(
      normalizeRequiredConditionRecord({
        record: { pointOfContact: { id: 'loaded-person-id' } },
        fieldMetadataItems: opportunity.fields,
      }),
    ).toEqual({ pointOfContact: { id: 'loaded-person-id' } });
  });
});
