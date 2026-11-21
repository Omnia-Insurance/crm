import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getRecordFieldColumnKey } from '@/object-record/record-field/utils/getRecordFieldColumnKey';
import { RecordColumnResizeHandle } from '@/object-record/record-index/components/RecordColumnResizeHandle';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { resizedFieldMetadataIdComponentState } from '@/object-record/record-table/states/resizedFieldMetadataIdComponentState';
import { useDragSelect } from '@/ui/utilities/drag-select/hooks/useDragSelect';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { isDefined } from 'twenty-shared/utils';
import { useIsMobile } from 'twenty-ui/utilities';

export const RecordTableHeaderResizeHandler = ({
  recordFieldIndex,
  position,
}: {
  recordFieldIndex: number;
  position: 'start' | 'end';
}) => {
  const { visibleRecordFields } = useRecordTableContextOrThrow();

  const recordField: RecordField | undefined =
    position === 'start'
      ? visibleRecordFields[recordFieldIndex - 1]
      : visibleRecordFields[recordFieldIndex];

  const isMobile = useIsMobile();

  const columnResizeDisabled = isMobile;

  const [resizedFieldMetadataId, setResizedFieldMetadataId] =
    useAtomComponentState(resizedFieldMetadataIdComponentState);

  // OMNIA-CUSTOM: the resize state holds the column key, which is fieldMetadataItemId for a plain column; a
  // relation sub-field column shares that id with its relation
  const columnKey = isDefined(recordField)
    ? getRecordFieldColumnKey(recordField)
    : undefined;

  const isResizing = columnKey === resizedFieldMetadataId;

  const { setDragSelectionStartEnabled } = useDragSelect();

  const handlePointerDown = () => {
    setDragSelectionStartEnabled(false);
    setResizedFieldMetadataId(columnKey);
  };

  return (
    !columnResizeDisabled && (
      <RecordColumnResizeHandle
        isResizing={isResizing}
        position={position}
        onPointerDown={handlePointerDown}
      />
    )
  );
};
