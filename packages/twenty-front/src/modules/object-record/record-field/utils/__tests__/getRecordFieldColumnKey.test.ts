import { getRecordFieldColumnKey } from '@/object-record/record-field/utils/getRecordFieldColumnKey';

const LEAD_FIELD_METADATA_ITEM_ID = 'lead-field-metadata-item-id';

describe('getRecordFieldColumnKey', () => {
  it('should keep the field metadata item id as the key of a plain column', () => {
    expect(
      getRecordFieldColumnKey({
        fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
      }),
    ).toBe(LEAD_FIELD_METADATA_ITEM_ID);
  });

  it('should treat a null or empty sub-field name as a plain column', () => {
    expect(
      getRecordFieldColumnKey({
        fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
        subFieldName: null,
      }),
    ).toBe(LEAD_FIELD_METADATA_ITEM_ID);
    expect(
      getRecordFieldColumnKey({
        fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
        subFieldName: '',
      }),
    ).toBe(LEAD_FIELD_METADATA_ITEM_ID);
  });

  it('should suffix the sub-field name for a relation sub-field column', () => {
    expect(
      getRecordFieldColumnKey({
        fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
        subFieldName: 'dateOfBirth',
      }),
    ).toBe(`${LEAD_FIELD_METADATA_ITEM_ID}.dateOfBirth`);
  });

  it('should give each column of the same relation its own key', () => {
    const columnKeys = [undefined, 'dateOfBirth', 'leadSource'].map(
      (subFieldName) =>
        getRecordFieldColumnKey({
          fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
          subFieldName,
        }),
    );

    expect(new Set(columnKeys).size).toBe(3);
  });
});
