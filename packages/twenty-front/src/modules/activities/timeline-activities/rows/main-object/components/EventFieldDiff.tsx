import { styled } from '@linaria/react';

import { EventFieldDiffLabel } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffLabel';
import { EventFieldDiffValue } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValue';
import { EventFieldDiffValueEffect } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValueEffect';
import { EventRelationFieldDiffValues } from '@/activities/timeline-activities/rows/main-object/components/EventRelationFieldDiffValues';
import { normalizeLegacyRelationDiffValue } from '@/activities/timeline-activities/utils/normalizeLegacyRelationDiffValue';
import { isRelationFieldChangeValue } from '@/activities/timeline-activities/utils/relationFieldChangeValue';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { Trans } from '@lingui/react/macro';
import { isObject } from '@sniptt/guards';
import { FieldMetadataType } from 'twenty-shared/types';
import { themeCssVariables } from 'twenty-ui/theme';
import { doNotTranslate } from 'twenty-shared/i18n';

type EventFieldDiffProps = {
  fieldDiff: { before: unknown; after: unknown };
  mainObjectMetadataItem: EnrichedObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem | undefined;
  diffArtificialRecordStoreId: string;
  // OMNIA-CUSTOM: record store entry of the previous value
  diffBeforeArtificialRecordStoreId: string;
};

const StyledEventFieldDiffContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[1]};
  height: 24px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEmptyValue = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
`;

// OMNIA-CUSTOM: previous value, muted and struck through. Its value
// wrapper sets the primary color, so the wrapper inherits ours instead
const StyledBeforeValue = styled.del`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  min-width: 0;
  overflow: hidden;
  text-decoration: line-through;

  & > div {
    color: inherit;
  }
`;

const StyledArrowContainer = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

export const EventFieldDiff = ({
  fieldDiff,
  mainObjectMetadataItem,
  fieldMetadataItem,
  diffArtificialRecordStoreId,
  diffBeforeArtificialRecordStoreId,
}: EventFieldDiffProps) => {
  if (!fieldMetadataItem) {
    throw new Error(doNotTranslate('fieldMetadataItem is required'));
  }

  // OMNIA-CUSTOM: older history rows store relation diffs as bare uuids
  const relationFieldDiff = normalizeLegacyRelationDiffValue({
    fieldDiff,
    fieldMetadataItem,
  });

  const isRelationFieldDiff =
    fieldMetadataItem.type === FieldMetadataType.RELATION &&
    (isRelationFieldChangeValue(relationFieldDiff.before) ||
      isRelationFieldChangeValue(relationFieldDiff.after));

  if (isRelationFieldDiff) {
    // OMNIA-CUSTOM: the values render the struck-through previous record and the arrow
    return (
      <StyledEventFieldDiffContainer>
        <EventFieldDiffLabel fieldMetadataItem={fieldMetadataItem} />
        <EventRelationFieldDiffValues
          fieldDiff={relationFieldDiff}
          fieldMetadataItem={fieldMetadataItem}
          showBeforeValue
        />
      </StyledEventFieldDiffContainer>
    );
  }

  const diffRecord = fieldDiff.after as Record<string, unknown> | undefined;
  // OMNIA-CUSTOM: previous value, shown before the arrow
  const diffBeforeRecord = fieldDiff.before as
    | Record<string, unknown>
    | undefined;

  const isValueEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === '';

  const isObjectEmpty = (objectValue: Record<string, unknown>): boolean =>
    Object.values(objectValue).every(isValueEmpty);

  const isUpdatedToEmpty =
    isValueEmpty(diffRecord) ||
    (typeof diffRecord === 'object' &&
      diffRecord !== null &&
      isObjectEmpty(diffRecord));

  // OMNIA-CUSTOM: no previous value to show (field was empty)
  const isBeforeValueEmpty =
    isValueEmpty(diffBeforeRecord) ||
    (isObject(diffBeforeRecord) && isObjectEmpty(diffBeforeRecord));

  return (
    <StyledEventFieldDiffContainer>
      <EventFieldDiffLabel fieldMetadataItem={fieldMetadataItem} />
      {/* OMNIA-CUSTOM: previous value ahead of the arrow */}
      {!isBeforeValueEmpty && (
        <StyledBeforeValue>
          <EventFieldDiffValueEffect
            diffArtificialRecordStoreId={diffBeforeArtificialRecordStoreId}
            mainObjectMetadataItem={mainObjectMetadataItem}
            fieldMetadataItem={fieldMetadataItem}
            diffRecord={diffBeforeRecord}
          />
          <EventFieldDiffValue
            diffArtificialRecordStoreId={diffBeforeArtificialRecordStoreId}
            mainObjectMetadataItem={mainObjectMetadataItem}
            fieldMetadataItem={fieldMetadataItem}
          />
        </StyledBeforeValue>
      )}
      <StyledArrowContainer>→</StyledArrowContainer>
      {isUpdatedToEmpty ? (
        <StyledEmptyValue>
          <Trans>Empty</Trans>
        </StyledEmptyValue>
      ) : (
        <>
          <EventFieldDiffValueEffect
            diffArtificialRecordStoreId={diffArtificialRecordStoreId}
            mainObjectMetadataItem={mainObjectMetadataItem}
            fieldMetadataItem={fieldMetadataItem}
            diffRecord={diffRecord}
          />
          <EventFieldDiffValue
            diffArtificialRecordStoreId={diffArtificialRecordStoreId}
            mainObjectMetadataItem={mainObjectMetadataItem}
            fieldMetadataItem={fieldMetadataItem}
          />
        </>
      )}
    </StyledEventFieldDiffContainer>
  );
};
