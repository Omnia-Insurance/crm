import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { RecordColumnResizeHandle } from '@/object-record/record-index/components/RecordColumnResizeHandle';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { resizedFieldMetadataIdComponentState } from '@/object-record/record-table/states/resizedFieldMetadataIdComponentState';
import { useDragSelect } from '@/ui/utilities/drag-select/hooks/useDragSelect';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { useIsMobile } from 'twenty-ui/utilities';

export const RecordTableHeaderResizeHandler = ({
  recordFieldIndex,
  position,
}: {
  recordFieldIndex: number;
  position: 'left' | 'right';
}) => {
  const { visibleRecordFields } = useRecordTableContextOrThrow();

  const recordField: RecordField | undefined =
    position === 'left'
      ? visibleRecordFields[recordFieldIndex - 1]
      : visibleRecordFields[recordFieldIndex];

  const isMobile = useIsMobile();

  const columnResizeDisabled = isMobile;

  const [resizedFieldMetadataId, setResizedFieldMetadataId] =
    useAtomComponentState(resizedFieldMetadataIdComponentState);

  // OMNIA-CUSTOM: Use recordField.id (unique per column) instead of
  // fieldMetadataItemId to correctly identify sub-field columns that
  // share the same parent field metadata.
  const isResizing = recordField?.id === resizedFieldMetadataId;

  const { setDragSelectionStartEnabled } = useDragSelect();

  const handlePointerDown = () => {
    setDragSelectionStartEnabled(false);
    setResizedFieldMetadataId(recordField?.id ?? null);
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
