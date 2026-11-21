import { ApplicationStackIcon } from '@/applications/components/ApplicationStackIcon';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { isActiveFieldMetadataItem } from '@/object-metadata/utils/isActiveFieldMetadataItem';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { useObjectOptionsDropdown } from '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown';
import { objectOptionsDropdownExpandedRelationFieldIdComponentState } from '@/object-record/object-options-dropdown/states/objectOptionsDropdownExpandedRelationFieldIdComponentState';
import { useChangeRecordFieldVisibility } from '@/object-record/record-field/hooks/useChangeRecordFieldVisibility';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { DropdownMenuHeader } from '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader';
import { DropdownMenuHeaderLeftComponent } from '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { LegacyDropdownContent } from '@/ui/layout/dropdown/components/LegacyDropdownContent';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { isOneToManyBackReferenceSubField } from '@/views/utils/isOneToManyBackReferenceSubField';
import { useLingui } from '@lingui/react/macro';
import { findById, isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components/input';
import { IconChevronLeft, IconEye } from 'twenty-ui/icon';
import { useIcons } from 'twenty-ui/icon/provider';
import { ListItem } from 'twenty-ui/primitives/navigation';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const DISPLAYABLE_SUB_FIELD_TYPES: ReadonlySet<FieldMetadataType> = new Set([
  FieldMetadataType.TEXT,
  FieldMetadataType.NUMBER,
  FieldMetadataType.DATE_TIME,
  FieldMetadataType.DATE,
  FieldMetadataType.BOOLEAN,
  FieldMetadataType.SELECT,
  FieldMetadataType.MULTI_SELECT,
  FieldMetadataType.RATING,
  FieldMetadataType.PHONES,
  FieldMetadataType.EMAILS,
  FieldMetadataType.FULL_NAME,
  FieldMetadataType.ADDRESS,
  FieldMetadataType.CURRENCY,
  FieldMetadataType.LINKS,
  FieldMetadataType.UUID,
  FieldMetadataType.RELATION,
]);

export const ObjectOptionsDropdownRelationSubFieldsContent = () => {
  const { t } = useLingui();
  const { getIcon } = useIcons();
  const { objectMetadataItem, recordIndexId, onContentChange } =
    useObjectOptionsDropdown();

  const objectOptionsDropdownExpandedRelationFieldId =
    useAtomComponentStateValue(
      objectOptionsDropdownExpandedRelationFieldIdComponentState,
    );

  const { objectMetadataItems } = useObjectMetadataItems();

  const currentRecordFields = useAtomComponentStateValue(
    currentRecordFieldsComponentState,
  );

  const { changeRecordFieldVisibility } =
    useChangeRecordFieldVisibility(recordIndexId);

  const relationFieldMetadataItem = isDefined(
    objectOptionsDropdownExpandedRelationFieldId,
  )
    ? objectMetadataItem.readableFields.find(
        findById(objectOptionsDropdownExpandedRelationFieldId),
      )
    : undefined;

  const targetObjectMetadataItem =
    isDefined(relationFieldMetadataItem) &&
    isManyToOneRelationField(relationFieldMetadataItem)
      ? objectMetadataItems.find(
          findById(relationFieldMetadataItem.relation.targetObjectMetadata.id),
        )
      : undefined;

  // readableFields: a target field the role cannot read never becomes a column (as in the sub-field header and cells)
  const subFieldMetadataItems = (
    targetObjectMetadataItem?.readableFields ?? []
  ).filter(
    (subFieldMetadataItem) =>
      isActiveFieldMetadataItem({ fieldMetadata: subFieldMetadataItem }) &&
      !subFieldMetadataItem.isSystem &&
      DISPLAYABLE_SUB_FIELD_TYPES.has(subFieldMetadataItem.type) &&
      !isOneToManyBackReferenceSubField({
        subFieldMetadataItem,
        baseObjectNameSingular: objectMetadataItem.nameSingular,
      }) &&
      !currentRecordFields.some(
        (recordField) =>
          recordField.isVisible &&
          recordField.fieldMetadataItemId === relationFieldMetadataItem?.id &&
          recordField.subFieldName === subFieldMetadataItem.name,
      ),
  );

  return (
    <LegacyDropdownContent>
      <DropdownMenuHeader
        StartComponent={
          <DropdownMenuHeaderLeftComponent
            onClick={() => onContentChange('hiddenFields')}
            Icon={IconChevronLeft}
          />
        }
      >
        {relationFieldMetadataItem?.label}
      </DropdownMenuHeader>
      <DropdownMenuItemsContainer>
        {isDefined(relationFieldMetadataItem) &&
        isNonEmptyArray(subFieldMetadataItems) ? (
          subFieldMetadataItems.map((subFieldMetadataItem) => (
            <ListItem
              key={subFieldMetadataItem.id}
              startIcon={
                <ApplicationStackIcon
                  Icon={getIcon(subFieldMetadataItem.icon)}
                  applicationId={subFieldMetadataItem.applicationId}
                />
              }
              actions={
                <LightIconButton
                  aria-label={t`Show field`}
                  onClick={() =>
                    changeRecordFieldVisibility({
                      fieldMetadataId: relationFieldMetadataItem.id,
                      isVisible: true,
                      subFieldName: subFieldMetadataItem.name,
                    })
                  }
                >
                  <IconEye />
                </LightIconButton>
              }
            >
              {subFieldMetadataItem.label}
            </ListItem>
          ))
        ) : (
          <ListItem disabled>{t`No fields available`}</ListItem>
        )}
      </DropdownMenuItemsContainer>
    </LegacyDropdownContent>
  );
};
