import { useMemo } from 'react';

import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getRecordFieldColumnKey } from '@/object-record/record-field/utils/getRecordFieldColumnKey';
import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { RecordTableCellFieldContextWrapper } from '@/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextWrapper';

export const RecordTableCellWrapper = ({
  children,
  recordField,
  recordFieldIndex,
}: {
  recordField: RecordField;
  recordFieldIndex: number;
  children: React.ReactNode;
}) => {
  const recordTableCellContextValue = useMemo(
    () => ({ recordField, columnIndex: recordFieldIndex }),
    [recordField, recordFieldIndex],
  );

  return (
    <RecordTableCellContext.Provider
      value={recordTableCellContextValue}
      // OMNIA-CUSTOM: sub-field columns share fieldMetadataItemId with their relation
      key={getRecordFieldColumnKey(recordField)}
    >
      <RecordTableCellFieldContextWrapper recordField={recordField}>
        {children}
      </RecordTableCellFieldContextWrapper>
    </RecordTableCellContext.Provider>
  );
};
