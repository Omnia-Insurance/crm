import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useGetButtonIcon } from '@/object-record/record-field/ui/hooks/useGetButtonIcon';
import { useIsFieldInputOnly } from '@/object-record/record-field/ui/hooks/useIsFieldInputOnly';
import { isRelationSubFieldDefinition } from '@/object-record/record-field/utils/isRelationSubFieldDefinition';

import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { RecordTableCellButtons } from '@/object-record/record-table/record-table-cell/components/RecordTableCellButtons';
import { RecordTableRelationSubFieldCellButtons } from '@/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons';
import { useGetSecondaryFieldButton } from '@/object-record/record-field/ui/hooks/useGetSecondaryFieldButton';
import { useOpenRecordTableCellFromCell } from '@/object-record/record-table/record-table-cell/hooks/useOpenRecordTableCellFromCell';
import { useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowUpRight, IconPencil } from 'twenty-ui/icon';
import { useLingui } from '@lingui/react/macro';

export const RecordTableCellEditButton = () => {
  const { t } = useLingui();
  const { columnIndex } = useContext(RecordTableCellContext);
  const { fieldDefinition } = useContext(FieldContext);
  const { openTableCell } = useOpenRecordTableCellFromCell();
  const isFieldInputOnly = useIsFieldInputOnly();
  const isFirstColumn = columnIndex === 0;
  const customButtonIcon = useGetButtonIcon();

  const secondaryButton = useGetSecondaryFieldButton();

  // OMNIA-CUSTOM: read-only relation sub-field columns act on the related record instead of editing
  if (isRelationSubFieldDefinition(fieldDefinition)) {
    return (
      <RecordTableRelationSubFieldCellButtons
        fieldDefinition={fieldDefinition}
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
          ariaLabel: isFirstColumn ? t`Open record` : t`Edit field`,
        },
      ]}
    />
  );
};
