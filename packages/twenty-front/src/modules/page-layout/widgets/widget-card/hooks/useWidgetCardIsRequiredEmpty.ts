import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { findFieldMetadataItemByFieldMetadataId } from '@/object-metadata/utils/findFieldMetadataItemByFieldMetadataId';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { isDefined } from 'twenty-shared/utils';

// Every widget header calls this and standalone pages have no target record, so no useTargetRecord
export const useWidgetCardIsRequiredEmpty = (
  fieldMetadataIdOrName: string | undefined,
): boolean => {
  const { targetRecordIdentifier } = useLayoutRenderingContext();

  const objectMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: targetRecordIdentifier?.targetObjectNameSingular ?? '',
      objectNameType: 'singular',
    },
  );

  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    isDefined(fieldMetadataIdOrName) ? (targetRecordIdentifier?.id ?? '') : '',
  );

  if (
    !isDefined(fieldMetadataIdOrName) ||
    !isDefined(objectMetadataItem) ||
    !isDefined(recordStore)
  ) {
    return false;
  }

  const fieldMetadataItem =
    objectMetadataItem.fields.find(
      (field) => field.name === fieldMetadataIdOrName,
    ) ??
    findFieldMetadataItemByFieldMetadataId({
      fieldMetadataItems: objectMetadataItem.fields,
      fieldMetadataId: fieldMetadataIdOrName,
    });

  // A field missing from the loaded record (not fetched, or unreadable) is not known to be empty
  if (
    !isDefined(fieldMetadataItem) ||
    !fieldMetadataItem.isActive ||
    !(fieldMetadataItem.name in recordStore)
  ) {
    return false;
  }

  return getRecordRequiredFieldViolations(recordStore, objectMetadataItem).some(
    (fieldViolation) => fieldViolation.fieldMetadataId === fieldMetadataItem.id,
  );
};
