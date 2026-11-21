import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { isOneToManyRelationField } from '@/object-metadata/utils/isOneToManyRelationField';
import { AdvancedFilterOneToManyEmptinessItems } from '@/object-record/advanced-filter/components/AdvancedFilterOneToManyEmptinessItems';
import { useApplyAdvancedFilterRelationTargetField } from '@/object-record/advanced-filter/hooks/useApplyAdvancedFilterRelationTargetField';
import { useApplyAdvancedFilterSourceField } from '@/object-record/advanced-filter/hooks/useApplyAdvancedFilterSourceField';
import { usePushFocusForLeafFieldValuePicker } from '@/object-record/advanced-filter/hooks/usePushFocusForLeafFieldValuePicker';
import { useFilterableFieldMetadataItems } from '@/object-record/record-filter/hooks/useFilterableFieldMetadataItems';
import { SelectOptionIcon } from '@/ui/input/components/SelectOptionIcon';
import { StandardObjectNameSingular } from 'twenty-shared/types';
import { Dropdown } from 'twenty-ui/components/navigation';
import { IconUserCircle } from 'twenty-ui/icon';
import { useIcons } from 'twenty-ui/icon/provider';
import { useLingui } from '@lingui/react/macro';

type AdvancedFilterRelationTargetFieldSelectMenuProps = {
  recordFilterId: string;
  sourceFieldMetadataItem: FieldMetadataItem;
};

export const AdvancedFilterRelationTargetFieldSelectMenu = ({
  recordFilterId,
  sourceFieldMetadataItem,
}: AdvancedFilterRelationTargetFieldSelectMenuProps) => {
  const { t } = useLingui();
  const { getIcon } = useIcons();
  const { applyAdvancedFilterRelationTargetField } =
    useApplyAdvancedFilterRelationTargetField();
  const { applyAdvancedFilterSourceField } =
    useApplyAdvancedFilterSourceField();
  const { pushFocusForLeafFieldValuePicker } =
    usePushFocusForLeafFieldValuePicker();
  const { objectMetadataItem: workspaceMemberObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: StandardObjectNameSingular.WorkspaceMember,
    });
  // OMNIA-CUSTOM: one-to-many sources traverse too, with has any / has no on
  // top; the target list stays many-to-one only (the server caps depth at 1)
  const isOneToManySource = isOneToManyRelationField(sourceFieldMetadataItem);
  const isTraversableSource =
    isManyToOneRelationField(sourceFieldMetadataItem) || isOneToManySource;
  const targetObjectMetadataId = isTraversableSource
    ? sourceFieldMetadataItem.relation.targetObjectMetadata.id
    : null;
  const { filterableFieldMetadataItems: relationTargetFields } =
    useFilterableFieldMetadataItems(targetObjectMetadataId ?? '');

  if (!isTraversableSource) {
    return null;
  }

  const isWorkspaceMemberTarget =
    isManyToOneRelationField(sourceFieldMetadataItem) &&
    sourceFieldMetadataItem.relation.targetObjectMetadata.nameSingular ===
      StandardObjectNameSingular.WorkspaceMember;

  const handleSelectTargetField = (
    relationTargetFieldMetadataItem: FieldMetadataItem,
  ) => {
    applyAdvancedFilterRelationTargetField({
      sourceFieldMetadataItem,
      relationTargetFieldMetadataItem,
      recordFilterId,
    });
    pushFocusForLeafFieldValuePicker(relationTargetFieldMetadataItem);
  };

  const handleSelectRelationRecord = () => {
    applyAdvancedFilterSourceField({
      sourceFieldMetadataItem,
      recordFilterId,
    });
  };

  return (
    <>
      <Dropdown.Back
        aria-label={t`${sourceFieldMetadataItem.label}, back to fields`}
      >
        {sourceFieldMetadataItem.label}
      </Dropdown.Back>
      <Dropdown.Section>
        {isWorkspaceMemberTarget && (
          <>
            <Dropdown.ActionItem
              onClick={handleSelectRelationRecord}
              startIcon={<IconUserCircle />}
            >
              {workspaceMemberObjectMetadataItem.labelSingular}
            </Dropdown.ActionItem>
            <Dropdown.Separator />
          </>
        )}
        {/* OMNIA-CUSTOM: has any / has no, saved as IS_NOT_EMPTY / IS_EMPTY */}
        {isOneToManySource && (
          <AdvancedFilterOneToManyEmptinessItems
            recordFilterId={recordFilterId}
            sourceFieldMetadataItem={sourceFieldMetadataItem}
          />
        )}
        {relationTargetFields.map((targetField) => (
          <Dropdown.ActionItem
            key={targetField.id}
            onClick={() => handleSelectTargetField(targetField)}
            startIcon={<SelectOptionIcon Icon={getIcon(targetField.icon)} />}
          >
            {targetField.label}
          </Dropdown.ActionItem>
        ))}
      </Dropdown.Section>
    </>
  );
};
