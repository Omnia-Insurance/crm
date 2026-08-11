import { ActivityTargetsInlineCell } from '@/activities/inline-cell/components/ActivityTargetsInlineCell';
import { useGetIsMetadataItemFromStandardApplication } from '@/object-metadata/hooks/useGetIsMetadataItemFromStandardApplication';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { formatFieldMetadataItemAsColumnDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useIsRecordReadOnly } from '@/object-record/read-only/hooks/useIsRecordReadOnly';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { RecordFieldListCellEditModePortal } from '@/object-record/record-field-list/anchored-portal/components/RecordFieldListCellEditModePortal';
import { RecordFieldListCellHoveredPortal } from '@/object-record/record-field-list/anchored-portal/components/RecordFieldListCellHoveredPortal';
import { useFieldListFieldMetadataItems } from '@/object-record/record-field-list/hooks/useFieldListFieldMetadataItems';
import { RecordDetailDuplicatesSection } from '@/object-record/record-field-list/record-detail-section/duplicate/components/RecordDetailDuplicatesSection';
import { RecordDetailMorphRelationSection } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailMorphRelationSection';
import { RecordDetailRelationSection } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSection';
import { RecordFieldListComponentInstanceContext } from '@/object-record/record-field-list/states/contexts/RecordFieldListComponentInstanceContext';
import { recordFieldListHoverPositionComponentState } from '@/object-record/record-field-list/states/recordFieldListHoverPositionComponentState';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RecordFieldComponentInstanceContext } from '@/object-record/record-field/ui/states/contexts/RecordFieldComponentInstanceContext';
import { isJunctionRelationForbidden } from '@/object-record/record-field/ui/utils/junction/isJunctionRelationForbidden';
import { RecordInlineCell } from '@/object-record/record-inline-cell/components/RecordInlineCell';
import { PropertyBox } from '@/object-record/record-inline-cell/property-box/components/PropertyBox';
import { useRecordShowContainerActions } from '@/object-record/record-show/hooks/useRecordShowContainerActions';
import { useRecordShowContainerData } from '@/object-record/record-show/hooks/useRecordShowContainerData';
import { getRecordFieldInputInstanceId } from '@/object-record/utils/getRecordFieldInputId';
import { getObjectPermissionsFromMapByObjectMetadataId } from '@/settings/roles/role-permissions/objects-permissions/utils/getObjectPermissionsFromMapByObjectMetadataId';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import {
  FieldMetadataType,
  type CoreObjectNameSingular,
} from 'twenty-shared/types';
import { useMemo } from 'react';

// OMNIA-CUSTOM: reconciliation diff data
type ReconciliationFieldDiff = {
  field: string;
  label: string;
  crmField: string | null;
  bobValue: string | null;
  crmValue: string | null;
  crmObjectType: string | null;
  note?: string | null;
};

type RecordFieldListProps = {
  instanceId: string;
  objectNameSingular: string;
  objectRecordId: string;
  showDuplicatesSection?: boolean;
  showRelationSections?: boolean;
  excludeFieldMetadataIds?: string[];
  excludeCreatedAtAndUpdatedAt?: boolean;
  showRequiredIndicator?: boolean;
  // OMNIA-CUSTOM: optional reconciliation diffs to overlay on fields
  fieldDiffs?: ReconciliationFieldDiff[];
};

export const RecordFieldList = ({
  instanceId,
  objectNameSingular,
  objectRecordId,
  showDuplicatesSection = true,
  showRelationSections = true,
  excludeFieldMetadataIds = [],
  excludeCreatedAtAndUpdatedAt = true,
  showRequiredIndicator = false,
  fieldDiffs,
}: RecordFieldListProps) => {
  const { recordLoading } = useRecordShowContainerData({
    objectRecordId,
  });

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { objectMetadataItems } = useObjectMetadataItems();
  const getIsMetadataItemFromStandardApplication =
    useGetIsMetadataItemFromStandardApplication();

  const { useUpdateOneObjectRecordMutation } = useRecordShowContainerActions({
    objectNameSingular,
  });

  const isRecordReadOnly = useIsRecordReadOnly({
    recordId: objectRecordId,
    objectMetadataId: objectMetadataItem.id,
  });

  const setRecordFieldListHoverPosition = useSetAtomComponentState(
    recordFieldListHoverPositionComponentState,
    instanceId,
  );

  const handleMouseEnter = (index: number) => {
    setRecordFieldListHoverPosition(index);
  };

  // OMNIA-CUSTOM: Build diff lookup for field overlay
  const diffByFieldName = useMemo(() => {
    if (!fieldDiffs) return null;
    const map = new Map<string, ReconciliationFieldDiff>();
    fieldDiffs.forEach((d) => {
      if (d.bobValue === d.crmValue) return;
      if (d.crmField) {
        map.set(d.crmField, d);
        // Also by last segment for composite paths like "emails.primaryEmail" → "emails"
        const parts = d.crmField.split('.');
        if (parts.length > 1) {
          map.set(parts[parts.length - 1], d);
          // Also just the first segment for composite fields
          map.set(parts[0], d);
        }
      }
    });
    return map;
  }, [fieldDiffs]);

  const {
    inlineFieldMetadataItems,
    legacyActivityTargetFieldMetadataItems,
    boxedRelationFieldMetadataItems,
  } = useFieldListFieldMetadataItems({
    objectNameSingular,
    excludeFieldMetadataIds,
    showRelationSections,
    excludeCreatedAtAndUpdatedAt,
  });

  return (
    <RecordFieldListComponentInstanceContext.Provider
      value={{
        instanceId,
      }}
    >
      <PropertyBox dataTestId="record-fields-list-container">
        {legacyActivityTargetFieldMetadataItems?.map(
          (fieldMetadataItem, index) => {
            const fieldDefinition = formatFieldMetadataItemAsColumnDefinition({
              field: fieldMetadataItem,
              position: index,
              objectMetadataItem,
              showLabel: true,
              labelWidth: 90,
            });

            return (
              <FieldContext.Provider
                key={objectRecordId + fieldMetadataItem.id}
                value={{
                  recordId: objectRecordId,
                  maxWidth: 200,
                  isLabelIdentifier: false,
                  fieldDefinition,
                  useUpdateRecord: useUpdateOneObjectRecordMutation,
                  isDisplayModeFixHeight: true,
                  onMouseEnter: () => handleMouseEnter(index),
                  anchorId: `${getRecordFieldInputInstanceId({
                    recordId: objectRecordId,
                    fieldName: fieldMetadataItem.name,
                    prefix: instanceId,
                  })}`,
                  isRecordFieldReadOnly: isRecordFieldReadOnly({
                    isRecordReadOnly,
                    isSystemObject: objectMetadataItem.isSystem,
                    objectPermissions:
                      getObjectPermissionsFromMapByObjectMetadataId({
                        objectPermissionsByObjectMetadataId,
                        objectMetadataId: objectMetadataItem.id,
                      }),
                    isFieldFromStandardApplication:
                      getIsMetadataItemFromStandardApplication(
                        fieldMetadataItem,
                      ),
                    fieldMetadataItem: {
                      id: fieldMetadataItem.id,
                      isUIEditable: fieldMetadataItem.isUIEditable ?? true,
                    },
                    fieldDefinition,
                    objectPermissionsByObjectMetadataId,
                  }),
                }}
              >
                <ActivityTargetsInlineCell
                  componentInstanceId={getRecordFieldInputInstanceId({
                    recordId: objectRecordId,
                    fieldName: fieldMetadataItem.name,
                    prefix: instanceId,
                  })}
                  activityObjectNameSingular={
                    objectNameSingular as
                      | CoreObjectNameSingular.Note
                      | CoreObjectNameSingular.Task
                  }
                  activityRecordId={objectRecordId}
                  showLabel={true}
                  maxWidth={200}
                />
              </FieldContext.Provider>
            );
          },
        )}
        {inlineFieldMetadataItems?.map((fieldMetadataItem, index) => {
          const fieldDefinition = formatFieldMetadataItemAsColumnDefinition({
            field: fieldMetadataItem,
            position: index,
            objectMetadataItem,
            showLabel: true,
            labelWidth: 90,
          });

          return (
            <FieldContext.Provider
              key={objectRecordId + fieldMetadataItem.id}
              value={{
                recordId: objectRecordId,
                maxWidth: 200,
                isLabelIdentifier: false,
                fieldDefinition,
                useUpdateRecord: useUpdateOneObjectRecordMutation,
                isDisplayModeFixHeight: true,
                isRecordFieldReadOnly: isRecordFieldReadOnly({
                  isRecordReadOnly,
                  isSystemObject: objectMetadataItem.isSystem,
                  objectPermissions:
                    getObjectPermissionsFromMapByObjectMetadataId({
                      objectPermissionsByObjectMetadataId,
                      objectMetadataId: objectMetadataItem.id,
                    }),
                  isFieldFromStandardApplication:
                    getIsMetadataItemFromStandardApplication(fieldMetadataItem),
                  fieldMetadataItem: {
                    id: fieldMetadataItem.id,
                    isUIEditable: fieldMetadataItem.isUIEditable ?? true,
                  },
                  fieldDefinition,
                  objectPermissionsByObjectMetadataId,
                }),
                onMouseEnter: () =>
                  handleMouseEnter(
                    index +
                      (legacyActivityTargetFieldMetadataItems?.length ?? 0),
                  ),
                anchorId: `${getRecordFieldInputInstanceId({
                  recordId: objectRecordId,
                  fieldName: fieldMetadataItem.name,
                  prefix: instanceId,
                })}`,
                isForbidden: isJunctionRelationForbidden({
                  fieldMetadataItem,
                  sourceObjectMetadataId: objectMetadataItem.id,
                  objectMetadataItems,
                  objectPermissionsByObjectMetadataId,
                }),
                // OMNIA-CUSTOM: inject reconciliation diff if available
                ...(() => {
                  const diff = diffByFieldName?.get(fieldMetadataItem.name);
                  if (!diff) return {};
                  return {
                    fieldDiff: {
                      oldValue: diff.crmValue,
                      newValue: diff.bobValue,
                      label: diff.label,
                      crmFieldPath: diff.crmField ?? undefined,
                      note: diff.note ?? null,
                    },
                  };
                })(),
              }}
            >
              <RecordFieldComponentInstanceContext.Provider
                value={{
                  instanceId: getRecordFieldInputInstanceId({
                    recordId: objectRecordId,
                    fieldName: fieldMetadataItem.name,
                    prefix: instanceId,
                  }),
                }}
              >
                <RecordInlineCell
                  loading={recordLoading}
                  instanceIdPrefix={instanceId}
                  showRequiredIndicator={showRequiredIndicator}
                />
              </RecordFieldComponentInstanceContext.Provider>
            </FieldContext.Provider>
          );
        })}
      </PropertyBox>
      {showDuplicatesSection && (
        <RecordDetailDuplicatesSection
          objectRecordId={objectRecordId}
          objectNameSingular={objectNameSingular}
        />
      )}
      {boxedRelationFieldMetadataItems
        .filter(
          (fieldMetadataItem) =>
            fieldMetadataItem.type === FieldMetadataType.RELATION ||
            fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION,
        )
        .map((fieldMetadataItem, index) => {
          const fieldDefinition = formatFieldMetadataItemAsColumnDefinition({
            field: fieldMetadataItem,
            position: index,
            objectMetadataItem,
          });

          return (
            <FieldContext.Provider
              key={objectRecordId + fieldMetadataItem.id}
              value={{
                recordId: objectRecordId,
                isLabelIdentifier: false,
                fieldDefinition,
                useUpdateRecord: useUpdateOneObjectRecordMutation,
                isDisplayModeFixHeight: true,
                isRecordFieldReadOnly: isRecordFieldReadOnly({
                  isRecordReadOnly,
                  isSystemObject: objectMetadataItem.isSystem,
                  objectPermissions:
                    getObjectPermissionsFromMapByObjectMetadataId({
                      objectPermissionsByObjectMetadataId,
                      objectMetadataId: objectMetadataItem.id,
                    }),
                  isFieldFromStandardApplication:
                    getIsMetadataItemFromStandardApplication(fieldMetadataItem),
                  fieldMetadataItem: {
                    id: fieldMetadataItem.id,
                    isUIEditable: fieldMetadataItem.isUIEditable ?? true,
                  },
                  fieldDefinition,
                  objectPermissionsByObjectMetadataId,
                }),
              }}
            >
              {fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION ? (
                <RecordDetailMorphRelationSection loading={recordLoading} />
              ) : (
                <RecordDetailRelationSection loading={recordLoading} />
              )}
            </FieldContext.Provider>
          );
        })}

      <RecordFieldListCellHoveredPortal
        objectMetadataItem={objectMetadataItem}
        recordId={objectRecordId}
      />
      <RecordFieldListCellEditModePortal
        objectMetadataItem={objectMetadataItem}
        recordId={objectRecordId}
      />
    </RecordFieldListComponentInstanceContext.Provider>
  );
};
