/**
 * Copy of RecordFieldList with diff overlay support.
 * For each inline field, checks if a corresponding FieldDiff exists.
 * Changed fields get a visual highlight with the proposed new value shown inline.
 */
import { ActivityTargetsInlineCell } from '@/activities/inline-cell/components/ActivityTargetsInlineCell';
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
import { styled } from '@linaria/react';
import { useMemo } from 'react';
import {
  FieldMetadataType,
  type CoreObjectNameSingular,
} from 'twenty-shared/types';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import type { FieldDiff } from '@/reconciliation/types/FieldDiff';

// ── Lead diff overlay styled components ──

const StyledLeadDiffOverlay = styled.div`
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  margin: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledLeadDiffTitle = styled.div`
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  color: ${themeCssVariables.accent.primary};
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledLeadDiffRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[1]};
  height: 24px;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledLeadDiffLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  min-width: 100px;
  flex-shrink: 0;
`;

const StyledLeadDiffOld = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  text-decoration: line-through;
`;

const StyledLeadDiffArrow = styled.span`
  color: ${themeCssVariables.font.color.light};
`;

const StyledLeadDiffNew = styled.span`
  color: ${themeCssVariables.accent.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

// ── Diff overlay styled components ──

const StyledDiffWrapper = styled.div<{ hasChange: boolean }>`
  border-left: 2px solid
    ${({ hasChange }) =>
      hasChange ? themeCssVariables.accent.primary : 'transparent'};
  padding-left: ${themeCssVariables.spacing[1]};
  background: ${({ hasChange }) =>
    hasChange ? themeCssVariables.background.secondary : 'transparent'};
  border-radius: 0 ${themeCssVariables.border.radius.sm}
    ${themeCssVariables.border.radius.sm} 0;
`;

const StyledProposedChange = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[1]};
  padding-left: 94px;
  padding-bottom: ${themeCssVariables.spacing[1]};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledProposedLabel = styled.span`
  color: ${themeCssVariables.accent.primary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledProposedValue = styled.span`
  color: ${themeCssVariables.accent.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

// ── Component ──

type ReconciliationRecordFieldListProps = {
  instanceId: string;
  objectNameSingular: string;
  objectRecordId: string;
  fieldDiffs: FieldDiff[];
  showRelationSections?: boolean;
};

export const ReconciliationRecordFieldList = ({
  instanceId,
  objectNameSingular,
  objectRecordId,
  fieldDiffs,
  showRelationSections = true,
}: ReconciliationRecordFieldListProps) => {
  const { recordLoading } = useRecordShowContainerData({
    objectRecordId,
  });

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { objectMetadataItems } = useObjectMetadataItems();

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

  const {
    inlineFieldMetadataItems,
    legacyActivityTargetFieldMetadataItems,
    boxedRelationFieldMetadataItems,
  } = useFieldListFieldMetadataItems({
    objectNameSingular,
    excludeFieldMetadataIds: [],
    showRelationSections,
    excludeCreatedAtAndUpdatedAt: true,
  });

  // Build lookup: multiple keys → FieldDiff for flexible matching
  // fieldDiff.crmField may be: "effectiveDate", "lead.name.firstName", or null
  // fieldDiff.field may be: "member_email", "broker_name" (BOB column keys)
  // We match against fieldMetadataItem.name AND fieldMetadataItem.label
  const diffByFieldName = useMemo(() => {
    const map = new Map<string, FieldDiff>();
    const labelMap = new Map<string, FieldDiff>();

    fieldDiffs.forEach((d) => {
      // Only index diffs that have actual changes
      const hasChange = d.bobValue !== null && d.bobValue !== d.crmValue;
      if (!hasChange) return;

      // Index by crmField (e.g., "effectiveDate")
      if (d.crmField) {
        map.set(d.crmField, d);
        // Also by last segment (e.g., "lead.name.firstName" → "firstName")
        const parts = d.crmField.split('.');
        if (parts.length > 1) {
          map.set(parts[parts.length - 1], d);
        }
      }

      // Index by raw field key (e.g., "member_email")
      if (d.field) {
        map.set(d.field, d);
      }

      // Index by label for fuzzy matching (e.g., "Email" → matches "Emails" field)
      if (d.label) {
        labelMap.set(d.label.toLowerCase(), d);
      }
    });

    return { byName: map, byLabel: labelMap };
  }, [fieldDiffs]);

  return (
    <RecordFieldListComponentInstanceContext.Provider
      value={{ instanceId }}
    >
      <PropertyBox dataTestId="record-fields-list-container">
        {legacyActivityTargetFieldMetadataItems?.map(
          (fieldMetadataItem, index) => (
            <FieldContext.Provider
              key={objectRecordId + fieldMetadataItem.id}
              value={{
                recordId: objectRecordId,
                maxWidth: 200,
                isLabelIdentifier: false,
                fieldDefinition: formatFieldMetadataItemAsColumnDefinition({
                  field: fieldMetadataItem,
                  position: index,
                  objectMetadataItem,
                  showLabel: true,
                  labelWidth: 90,
                }),
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
                  fieldMetadataItem: {
                    id: fieldMetadataItem.id,
                    isUIReadOnly: fieldMetadataItem.isUIReadOnly ?? false,
                    isCustom: fieldMetadataItem.isCustom ?? false,
                  },
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
          ),
        )}
        {inlineFieldMetadataItems?.map((fieldMetadataItem, index) => {
          // OMNIA-CUSTOM: Check if this field has a BOB diff
          const diff =
            diffByFieldName.byName.get(fieldMetadataItem.name) ??
            diffByFieldName.byLabel.get(fieldMetadataItem.label.toLowerCase());
          const hasChange = diff !== undefined;

          const fieldCell = (
            <FieldContext.Provider
              key={objectRecordId + fieldMetadataItem.id}
              value={{
                recordId: objectRecordId,
                maxWidth: 200,
                isLabelIdentifier: false,
                fieldDefinition: formatFieldMetadataItemAsColumnDefinition({
                  field: fieldMetadataItem,
                  position: index,
                  objectMetadataItem,
                  showLabel: true,
                  labelWidth: 90,
                }),
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
                  fieldMetadataItem: {
                    id: fieldMetadataItem.id,
                    isUIReadOnly: fieldMetadataItem.isUIReadOnly ?? false,
                    isCustom: fieldMetadataItem.isCustom ?? false,
                  },
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
                />
              </RecordFieldComponentInstanceContext.Provider>
            </FieldContext.Provider>
          );

          // OMNIA-CUSTOM: Wrap changed fields with diff highlight
          if (hasChange && diff) {
            return (
              <StyledDiffWrapper
                key={objectRecordId + fieldMetadataItem.id}
                hasChange
              >
                {fieldCell}
                <StyledProposedChange>
                  <StyledProposedLabel>BOB →</StyledProposedLabel>
                  <StyledProposedValue>{diff.bobValue}</StyledProposedValue>
                </StyledProposedChange>
              </StyledDiffWrapper>
            );
          }

          return fieldCell;
        })}
      </PropertyBox>

      {boxedRelationFieldMetadataItems
        .filter(
          (fieldMetadataItem) =>
            fieldMetadataItem.type === FieldMetadataType.RELATION ||
            fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION,
        )
        .map((fieldMetadataItem, index) => (
          <FieldContext.Provider
            key={objectRecordId + fieldMetadataItem.id}
            value={{
              recordId: objectRecordId,
              isLabelIdentifier: false,
              fieldDefinition: formatFieldMetadataItemAsColumnDefinition({
                field: fieldMetadataItem,
                position: index,
                objectMetadataItem,
              }),
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
                fieldMetadataItem: {
                  id: fieldMetadataItem.id,
                  isUIReadOnly: fieldMetadataItem.isUIReadOnly ?? false,
                  isCustom: fieldMetadataItem.isCustom ?? false,
                },
              }),
            }}
          >
            {fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION ? (
              <RecordDetailMorphRelationSection loading={recordLoading} />
            ) : (
              <RecordDetailRelationSection loading={recordLoading} />
            )}
          </FieldContext.Provider>
        ))}

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
