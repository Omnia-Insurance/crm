import { styled } from '@linaria/react';
import { FieldDescriptionTooltip } from '@/object-record/record-field/ui/components/FieldDescriptionTooltip';

import { fieldMetadataItemByIdSelector } from '@/object-metadata/states/fieldMetadataItemByIdSelector';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { RECORD_TABLE_CELL_CONTENT_CLASS_NAME } from '@/object-record/record-table/constants/RecordTableCellContentClassName';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { getRelationSubFieldColumnLabel } from '@/views/utils/getRelationSubFieldColumnLabel';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { useIcons } from 'twenty-ui/icon/provider';
import { useTheme, themeCssVariables } from 'twenty-ui/theme';

const StyledTitle = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[8]};
  padding-left: ${themeCssVariables.spacing[2]};
  padding-right: ${themeCssVariables.spacing[2]};
`;

const StyledIcon = styled.div`
  display: flex;
  flex-shrink: 0;
`;

type RecordTableColumnHeadProps = {
  recordField: RecordField;
};

export const RecordTableColumnHead = ({
  recordField,
}: RecordTableColumnHeadProps) => {
  const theme = useTheme();

  const correspondingFieldMetadataItem = useAtomFamilySelectorValue(
    fieldMetadataItemByIdSelector,
    { fieldMetadataItemId: recordField.fieldMetadataItemId },
  );

  const { getIcon } = useIcons();
  const fieldMetadataItem =
    correspondingFieldMetadataItem.foundFieldMetadataItem;

  // OMNIA-CUSTOM: a relation sub-field column ("Lead / Date of Birth") takes the target field's label, icon and
  // description. A target field the role cannot read, or a missing one, shows its raw name and nothing more
  const { objectMetadataItems } = useRecordTableContextOrThrow();
  const { subFieldName } = recordField;
  const isSubFieldColumn =
    isNonEmptyString(subFieldName) && isDefined(fieldMetadataItem);
  const subFieldMetadataItem = isSubFieldColumn
    ? getRelationSubFieldMetadataItem({
        targetObjectMetadataId:
          fieldMetadataItem.relation?.targetObjectMetadata.id,
        subFieldName,
        objectMetadataItems,
      })
    : null;
  const label = isSubFieldColumn
    ? getRelationSubFieldColumnLabel({
        relationFieldLabel: fieldMetadataItem.label,
        subFieldLabel: subFieldMetadataItem?.label ?? subFieldName,
      })
    : fieldMetadataItem?.label;
  const description = isSubFieldColumn
    ? subFieldMetadataItem?.description
    : fieldMetadataItem?.description;

  const Icon = getIcon(subFieldMetadataItem?.icon ?? fieldMetadataItem?.icon);

  return (
    <StyledTitle className={RECORD_TABLE_CELL_CONTENT_CLASS_NAME}>
      <StyledIcon>
        <Icon size={theme.icon.size.md} />
      </StyledIcon>
      <FieldDescriptionTooltip label={label} description={description} />
    </StyledTitle>
  );
};
