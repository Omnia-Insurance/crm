import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useApplyAdvancedFilterSourceField } from '@/object-record/advanced-filter/hooks/useApplyAdvancedFilterSourceField';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLingui } from '@lingui/react/macro';
import { RecordFilterOperand } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Dropdown } from 'twenty-ui/components/navigation';
import { IconFilterOff, IconFilterPlus } from 'twenty-ui/icon';

type AdvancedFilterOneToManyEmptinessItemsProps = {
  recordFilterId: string;
  sourceFieldMetadataItem: FieldMetadataItem;
};

export const AdvancedFilterOneToManyEmptinessItems = ({
  recordFilterId,
  sourceFieldMetadataItem,
}: AdvancedFilterOneToManyEmptinessItemsProps) => {
  const { t } = useLingui();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const { applyAdvancedFilterSourceField } =
    useApplyAdvancedFilterSourceField();

  const targetObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.id ===
      sourceFieldMetadataItem.relation?.targetObjectMetadata.id,
  );

  if (!isDefined(targetObjectMetadataItem)) {
    return null;
  }

  const targetLabelPlural = targetObjectMetadataItem.labelPlural;

  const handleSelect = (operand: RecordFilterOperand) => {
    applyAdvancedFilterSourceField({
      sourceFieldMetadataItem,
      recordFilterId,
      operand,
    });
  };

  return (
    <>
      <Dropdown.ActionItem
        onClick={() => handleSelect(RecordFilterOperand.IS_NOT_EMPTY)}
        startIcon={<IconFilterPlus />}
      >
        {t`Has any ${targetLabelPlural}`}
      </Dropdown.ActionItem>
      <Dropdown.ActionItem
        onClick={() => handleSelect(RecordFilterOperand.IS_EMPTY)}
        startIcon={<IconFilterOff />}
      >
        {t`Has no ${targetLabelPlural}`}
      </Dropdown.ActionItem>
      <Dropdown.Separator />
    </>
  );
};
