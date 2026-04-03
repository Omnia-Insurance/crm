import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useGetButtonIcon } from '@/object-record/record-field/ui/hooks/useGetButtonIcon';
import { useIsFieldInputOnly } from '@/object-record/record-field/ui/hooks/useIsFieldInputOnly';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { RecordTableCellButtons } from '@/object-record/record-table/record-table-cell/components/RecordTableCellButtons';
import { useGetSecondaryRecordTableCellButton } from '@/object-record/record-table/record-table-cell/hooks/useGetSecondaryRecordTableCellButton';
import { useOpenRecordTableCellFromCell } from '@/object-record/record-table/record-table-cell/hooks/useOpenRecordTableCellFromCell';
import { useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowUpRight, IconPencil } from 'twenty-ui/display';

export const RecordTableCellEditButton = () => {
  const { cellPosition } = useContext(RecordTableCellContext);
  const { fieldDefinition, recordId } = useContext(FieldContext);
  const { openTableCell } = useOpenRecordTableCellFromCell();
  const isFieldInputOnly = useIsFieldInputOnly();
  const isFirstColumn = cellPosition.column === 0;
  const customButtonIcon = useGetButtonIcon();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const secondaryButton = useGetSecondaryRecordTableCellButton();

  // OMNIA-CUSTOM: Sub-field columns show "open related record" instead of edit
  const metadata = fieldDefinition.metadata as Record<string, unknown>;
  const isSubField = !!metadata.subFieldName;
  const relationFieldName = fieldDefinition.metadata.fieldName;

  const relatedObject = useRecordFieldValue<Record<string, unknown> | null>(
    recordId,
    relationFieldName,
    fieldDefinition,
  );

  if (isSubField) {
    const relatedObjectNameSingular =
      metadata.relationObjectMetadataNameSingular as string | undefined;
    const relatedRecordId = relatedObject?.id as string | undefined;

    const handleOpenRelatedRecord = () => {
      if (relatedRecordId && relatedObjectNameSingular) {
        openRecordInSidePanel({
          recordId: relatedRecordId,
          objectNameSingular: relatedObjectNameSingular,
        });
      }
    };

    return (
      <RecordTableCellButtons
        buttons={[
          ...secondaryButton,
          ...(relatedRecordId
            ? [{ onClick: handleOpenRelatedRecord, Icon: IconArrowUpRight }]
            : []),
        ]}
      />
    );
  }

  const mainButtonIcon = isFirstColumn
    ? IconArrowUpRight
    : isDefined(customButtonIcon)
      ? customButtonIcon
      : IconPencil;

  const handleMainButtonClick = () => {
    if (!isFieldInputOnly && isFirstColumn) {
      openTableCell(undefined, true);
    } else {
      openTableCell();
    }
  };

  return (
    <RecordTableCellButtons
      buttons={[
        ...secondaryButton,
        {
          onClick: handleMainButtonClick,
          Icon: mainButtonIcon,
        },
      ]}
    />
  );
};
