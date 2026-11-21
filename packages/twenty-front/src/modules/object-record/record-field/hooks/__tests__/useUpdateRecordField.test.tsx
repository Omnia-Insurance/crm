import { useUpdateRecordField } from '@/object-record/record-field/hooks/useUpdateRecordField';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

const RECORD_TABLE_ID = 'record-table-id';
const LEAD_FIELD_METADATA_ITEM_ID = 'lead-field-metadata-item-id';

const leadDateOfBirthRecordField: RecordField = {
  id: 'lead-date-of-birth-record-field-id',
  fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
  subFieldName: 'dateOfBirth',
  position: 1,
  isVisible: true,
  size: 150,
};

const leadRecordField: RecordField = {
  id: 'lead-record-field-id',
  fieldMetadataItemId: LEAD_FIELD_METADATA_ITEM_ID,
  position: 2,
  isVisible: true,
  size: 100,
};

const renderUpdateRecordField = (recordFields: RecordField[]) => {
  const store = createStore();
  const currentRecordFieldsAtom = currentRecordFieldsComponentState.atomFamily({
    instanceId: RECORD_TABLE_ID,
  });

  store.set(currentRecordFieldsAtom, recordFields);

  const { result } = renderHook(() => useUpdateRecordField(RECORD_TABLE_ID), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    ),
  });

  return {
    updateRecordField: result.current.updateRecordField,
    getCurrentRecordFields: () => store.get(currentRecordFieldsAtom),
  };
};

describe('useUpdateRecordField', () => {
  it('should update the sub-field column matching the record field id and leave its relation column alone', () => {
    const { updateRecordField, getCurrentRecordFields } =
      renderUpdateRecordField([leadRecordField, leadDateOfBirthRecordField]);

    act(() => {
      updateRecordField(leadDateOfBirthRecordField.id, { isVisible: false });
    });

    expect(getCurrentRecordFields()).toEqual([
      leadRecordField,
      { ...leadDateOfBirthRecordField, isVisible: false },
    ]);
  });

  it('should update the plain column when given a field metadata item id', () => {
    const { updateRecordField, getCurrentRecordFields } =
      renderUpdateRecordField([leadDateOfBirthRecordField, leadRecordField]);

    let updatedRecordField: RecordField | undefined;

    act(() => {
      updatedRecordField = updateRecordField(LEAD_FIELD_METADATA_ITEM_ID, {
        position: 5,
      });
    });

    expect(updatedRecordField).toEqual({ ...leadRecordField, position: 5 });
    expect(getCurrentRecordFields()).toEqual([
      leadDateOfBirthRecordField,
      { ...leadRecordField, position: 5 },
    ]);
  });

  it('should throw when only sub-field columns use the field metadata item id', () => {
    const { updateRecordField, getCurrentRecordFields } =
      renderUpdateRecordField([leadDateOfBirthRecordField]);

    expect(() =>
      updateRecordField(LEAD_FIELD_METADATA_ITEM_ID, { size: 200 }),
    ).toThrow();
    expect(getCurrentRecordFields()).toEqual([leadDateOfBirthRecordField]);
  });
});
