import { getAdvancedFilterFieldSubPage } from '@/object-record/advanced-filter/utils/getAdvancedFilterFieldSubPage';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const companyObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');

const getCompanyField = (fieldName: string) =>
  companyObjectMetadataItem.fields.find((field) => field.name === fieldName)!;

describe('getAdvancedFilterFieldSubPage', () => {
  it('opens the relation target page for a many-to-one relation', () => {
    expect(getAdvancedFilterFieldSubPage(getCompanyField('accountOwner'))).toBe(
      'relation-target',
    );
  });

  it('opens the relation target page for a one-to-many relation', () => {
    expect(getAdvancedFilterFieldSubPage(getCompanyField('people'))).toBe(
      'relation-target',
    );
  });

  it('opens the composite page for a composite field', () => {
    expect(getAdvancedFilterFieldSubPage(getCompanyField('address'))).toBe(
      'composite',
    );
  });

  it('applies a plain field directly', () => {
    expect(getAdvancedFilterFieldSubPage(getCompanyField('name'))).toBeNull();
  });
});
