import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { Fragment, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDefined, isPlainObject, isValidUuid } from 'twenty-shared/utils';
import { IconButton } from 'twenty-ui/components/input';
import { IconPencil, IconPlus } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { RecordDetailRecordsListContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailRecordsListContainer';
import { RecordDetailRelationRecordsListItem } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem';
import { RecordDetailRelationRecordsListItemEffect } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItemEffect';
import { RecordDetailRelationSectionDropdown } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdown';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import {
  FieldInputEventContext,
  type FieldInputEvent,
} from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { useIsFieldRequired } from '@/object-record/record-field/ui/hooks/useIsFieldRequired';
import { usePersistField } from '@/object-record/record-field/ui/hooks/usePersistField';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { FIELD_WIDGET_RELATION_CARD_INITIAL_VISIBLE_ITEMS } from '@/page-layout/widgets/field/constants/FieldWidgetRelationCardInitialVisibleItems';
import { useFieldWidgetRelationRecordsTotalCount } from '@/page-layout/widgets/field/hooks/useFieldWidgetRelationRecordsTotalCount';
import { useFieldWidgetRelationSeeAllHref } from '@/page-layout/widgets/field/hooks/useFieldWidgetRelationSeeAllHref';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { RelationType } from '~/generated-metadata/graphql';

const StyledSection = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding-bottom: ${themeCssVariables.spacing[3]};
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.header<{ hasRelationRecords: boolean }>`
  align-items: center;
  display: flex;
  height: ${themeCssVariables.spacing[6]};
  justify-content: space-between;
  margin-bottom: ${({ hasRelationRecords }) =>
    hasRelationRecords ? themeCssVariables.spacing[2] : '0'};
  padding-left: ${themeCssVariables.spacing[3]};
  padding-right: ${themeCssVariables.spacing[2]};

  .displayOnHover {
    opacity: ${({ hasRelationRecords }) => (hasRelationRecords ? 0 : 1)};
    pointer-events: ${({ hasRelationRecords }) =>
      hasRelationRecords ? 'none' : 'auto'};
  }

  &:hover .displayOnHover,
  &:focus-within .displayOnHover,
  &:has([aria-expanded='true']) .displayOnHover {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .displayOnHover {
      opacity: 1;
      pointer-events: auto;
    }
  }
`;

const StyledTitle = styled.div`
  align-items: flex-end;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTitleLabel = styled.div<{ isRequiredEmpty: boolean }>`
  color: ${({ isRequiredEmpty }) =>
    isRequiredEmpty ? themeCssVariables.color.red : 'inherit'};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledHoverRevealedAction = styled.div`
  display: flex;
`;

const StyledSeeAllLink = styled(Link)`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  text-decoration: none;

  &:hover {
    color: ${themeCssVariables.font.color.secondary};
  }
`;

type ReconciliationRecordRelationSeeAllLinkProps = {
  recordId: string;
  relationFieldMetadata: FieldRelationMetadata;
};

const ReconciliationRecordRelationSeeAllLink = ({
  recordId,
  relationFieldMetadata,
}: ReconciliationRecordRelationSeeAllLinkProps) => {
  const { t } = useLingui();

  const { relationRecordsTotalCount } = useFieldWidgetRelationRecordsTotalCount(
    { recordId, relationFieldMetadata },
  );

  const { seeAllHref } = useFieldWidgetRelationSeeAllHref({
    recordId,
    relationMetadata: relationFieldMetadata,
  });

  if (
    !isDefined(seeAllHref) ||
    !isDefined(relationRecordsTotalCount) ||
    relationRecordsTotalCount === 0
  ) {
    return null;
  }

  return (
    <StyledSeeAllLink to={seeAllHref}>
      {t`All (${relationRecordsTotalCount})`}
    </StyledSeeAllLink>
  );
};

type ReconciliationRecordRelationSectionProps = {
  isAutoExpanded: boolean;
};

export const ReconciliationRecordRelationSection = ({
  isAutoExpanded,
}: ReconciliationRecordRelationSectionProps) => {
  const { t } = useLingui();

  const { recordId, fieldDefinition, isRecordFieldReadOnly } =
    useContext(FieldContext);

  const relationFieldMetadata =
    fieldDefinition.metadata as FieldRelationMetadata;

  const {
    fieldName,
    relationType,
    relationFieldMetadataId,
    relationObjectMetadataNameSingular,
    objectMetadataNameSingular,
  } = relationFieldMetadata;

  const isRequiredEmpty = useIsFieldRequired();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: objectMetadataNameSingular ?? '',
  });

  const persistField = usePersistField({
    objectMetadataItemId: objectMetadataItem.id,
  });

  const fieldValue = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName,
  });

  const relationRecords: ObjectRecord[] = Array.isArray(fieldValue)
    ? fieldValue
    : isPlainObject(fieldValue)
      ? [fieldValue as ObjectRecord]
      : [];

  // A reviewer's own toggle wins; until then the section follows the pending diffs.
  const [manuallyExpandedRecordId, setManuallyExpandedRecordId] = useState<
    string | null
  >(null);

  const autoExpandedRecordId = isAutoExpanded
    ? (relationRecords[0]?.id ?? '')
    : '';

  const expandedRecordId = manuallyExpandedRecordId ?? autoExpandedRecordId;

  const handleItemClick = (relationRecordId: string) =>
    setManuallyExpandedRecordId(
      relationRecordId === expandedRecordId ? '' : relationRecordId,
    );

  const handleSubmit: FieldInputEvent = ({ newValue }) => {
    persistField({
      recordId,
      fieldDefinition,
      valueToPersist: newValue,
    });
  };

  const hasRelationRecords = relationRecords.length > 0;

  // Preview records only live in the store: nothing to fetch or count
  const isRecordPersisted = isValidUuid(recordId);

  const isEditAction =
    relationType === RelationType.MANY_TO_ONE || hasRelationRecords;

  const dropdownTriggerLabel = isEditAction
    ? t`Edit relation`
    : t`Add relation`;

  const visibleRelationRecords = relationRecords.slice(
    0,
    FIELD_WIDGET_RELATION_CARD_INITIAL_VISIBLE_ITEMS,
  );

  return (
    <FieldInputEventContext.Provider value={{ onSubmit: handleSubmit }}>
      <StyledSection>
        <StyledHeader hasRelationRecords={hasRelationRecords}>
          <StyledTitle>
            <StyledTitleLabel isRequiredEmpty={isRequiredEmpty}>
              {fieldDefinition.label}
            </StyledTitleLabel>
            {relationType === RelationType.ONE_TO_MANY && isRecordPersisted && (
              <ReconciliationRecordRelationSeeAllLink
                recordId={recordId}
                relationFieldMetadata={relationFieldMetadata}
              />
            )}
          </StyledTitle>
          {!isRecordFieldReadOnly && (
            <StyledHoverRevealedAction className="displayOnHover">
              <RecordDetailRelationSectionDropdown
                loading={false}
                dropdownTriggerClickableComponent={
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label={dropdownTriggerLabel}
                  >
                    {isEditAction ? <IconPencil /> : <IconPlus />}
                  </IconButton>
                }
              />
            </StyledHoverRevealedAction>
          )}
        </StyledHeader>
        {hasRelationRecords && (
          <RecordDetailRecordsListContainer>
            {visibleRelationRecords.map((relationRecord) => (
              <Fragment key={`${relationRecord.id}-${relationFieldMetadataId}`}>
                {isValidUuid(relationRecord.id) && (
                  <RecordDetailRelationRecordsListItemEffect
                    relationRecordId={relationRecord.id}
                    relationObjectMetadataNameSingular={
                      relationObjectMetadataNameSingular
                    }
                  />
                )}
                <RecordDetailRelationRecordsListItem
                  isExpanded={expandedRecordId === relationRecord.id}
                  onClick={handleItemClick}
                  relationRecord={relationRecord}
                  relationObjectMetadataNameSingular={
                    relationObjectMetadataNameSingular
                  }
                  relationFieldMetadataId={relationFieldMetadataId}
                />
              </Fragment>
            ))}
          </RecordDetailRecordsListContainer>
        )}
      </StyledSection>
    </FieldInputEventContext.Provider>
  );
};
