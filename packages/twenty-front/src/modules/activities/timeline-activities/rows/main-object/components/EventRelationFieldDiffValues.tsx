import { styled } from '@linaria/react';
import { useMemo } from 'react';

import { isRelationFieldChangeValue } from '@/activities/timeline-activities/utils/relationFieldChangeValue';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getObjectRecordIdentifier } from '@/object-metadata/utils/getObjectRecordIdentifier';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { TooltipDelay } from '@/ui/layout/tooltip/constants/TooltipDelay';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

type EventRelationFieldDiffValuesProps = {
  fieldDiff: { before: unknown; after: unknown };
  fieldMetadataItem: FieldMetadataItem;
  // OMNIA-CUSTOM: timeline rows show the previous record inline, then the arrow
  showBeforeValue?: boolean;
};

const StyledRelationValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEmptyValue = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
`;

// OMNIA-CUSTOM: previous related record, muted and struck through
const StyledRelationBeforeValue = styled.del`
  color: ${themeCssVariables.font.color.tertiary};
  min-width: 0;
  overflow: hidden;
  text-decoration: line-through;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledArrowContainer = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const getRelationRecordId = (value: unknown): string | null => {
  if (!isRelationFieldChangeValue(value)) {
    return null;
  }

  if (!isDefined(value.id) || value.id === '') {
    return null;
  }

  return value.id;
};

const EventRelationFieldDiffValuesWithFetch = ({
  fieldDiff,
  relationTargetObjectMetadataNameSingular,
  showBeforeValue,
}: {
  fieldDiff: { before: unknown; after: unknown };
  relationTargetObjectMetadataNameSingular: string;
  showBeforeValue?: boolean;
}) => {
  const relationRecordIds = useMemo(() => {
    const recordIds = new Set<string>();

    for (const relationFieldChangeValue of [
      fieldDiff.before,
      fieldDiff.after,
    ]) {
      const relationRecordId = getRelationRecordId(relationFieldChangeValue);

      if (isDefined(relationRecordId)) {
        recordIds.add(relationRecordId);
      }
    }

    return Array.from(recordIds);
  }, [fieldDiff.after, fieldDiff.before]);

  const { objectMetadataItem: relationTargetObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: relationTargetObjectMetadataNameSingular,
    });

  const { records, loading } = useFindManyRecords({
    objectNameSingular: relationTargetObjectMetadataNameSingular,
    filter: {
      id: {
        in: relationRecordIds,
      },
    },
    skip: relationRecordIds.length === 0,
  });

  const recordsById = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );

  const resolveDisplayName = (value: unknown): string | null => {
    const relationRecordId = getRelationRecordId(value);

    if (!isDefined(relationRecordId)) {
      return null;
    }

    const relatedRecord = recordsById.get(relationRecordId);

    if (isDefined(relatedRecord)) {
      return getObjectRecordIdentifier({
        objectMetadataItem: relationTargetObjectMetadataItem,
        record: relatedRecord,
        allowRequestsToTwentyIcons: false,
      }).name;
    }

    if (loading) {
      return null;
    }

    return relationRecordId;
  };

  const beforeDisplayName = resolveDisplayName(fieldDiff.before);
  const afterDisplayName = resolveDisplayName(fieldDiff.after);

  return (
    <RelationFieldDiffValue
      beforeDisplayName={beforeDisplayName}
      afterDisplayName={afterDisplayName}
      showBeforeValue={showBeforeValue}
    />
  );
};

const RelationFieldDiffValue = ({
  beforeDisplayName,
  afterDisplayName,
  showBeforeValue = false,
}: {
  beforeDisplayName: string | null;
  afterDisplayName: string | null;
  showBeforeValue?: boolean;
}) => {
  const { t } = useLingui();

  // OMNIA-CUSTOM: previous record (when there was one) and the arrow, then the value
  if (showBeforeValue) {
    return (
      <>
        {beforeDisplayName !== null && (
          <StyledRelationBeforeValue>
            {beforeDisplayName}
          </StyledRelationBeforeValue>
        )}
        <StyledArrowContainer>→</StyledArrowContainer>
        <RelationFieldDiffValue
          beforeDisplayName={beforeDisplayName}
          afterDisplayName={afterDisplayName}
        />
      </>
    );
  }

  const emptyLabel = t`Empty`;
  const tooltipContent = `${beforeDisplayName ?? emptyLabel} → ${
    afterDisplayName ?? emptyLabel
  }`;

  return (
    <Tooltip
      content={tooltipContent}
      delay={TooltipDelay.shortDelay}
      side="bottom"
      positionMethod="fixed"
    >
      {afterDisplayName !== null ? (
        <StyledRelationValue>{afterDisplayName}</StyledRelationValue>
      ) : (
        <StyledEmptyValue>
          <Trans>Empty</Trans>
        </StyledEmptyValue>
      )}
    </Tooltip>
  );
};

export const EventRelationFieldDiffValues = ({
  fieldDiff,
  fieldMetadataItem,
  showBeforeValue,
}: EventRelationFieldDiffValuesProps) => {
  const relationTargetObjectMetadataNameSingular =
    fieldMetadataItem.relation?.targetObjectMetadata.nameSingular;

  if (!isDefined(relationTargetObjectMetadataNameSingular)) {
    const beforeDisplayName = getRelationRecordId(fieldDiff.before);
    const afterDisplayName = getRelationRecordId(fieldDiff.after);

    return (
      <RelationFieldDiffValue
        beforeDisplayName={beforeDisplayName}
        afterDisplayName={afterDisplayName}
        showBeforeValue={showBeforeValue}
      />
    );
  }

  return (
    <EventRelationFieldDiffValuesWithFetch
      fieldDiff={fieldDiff}
      relationTargetObjectMetadataNameSingular={
        relationTargetObjectMetadataNameSingular
      }
      showBeforeValue={showBeforeValue}
    />
  );
};
