import { styled } from '@linaria/react';

import { EventFieldDiffLabel } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffLabel';
import { EventFieldDiffRelationValue } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffRelationValue';
import { EventFieldDiffValue } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValue';
import { EventFieldDiffValueEffect } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValueEffect';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { Trans } from '@lingui/react/macro';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type EventFieldDiffProps = {
  diffRecord: Record<string, unknown>;
  // OMNIA-CUSTOM: optional before-value preview for timeline update events.
  diffBeforeRecord?: Record<string, unknown>;
  mainObjectMetadataItem: EnrichedObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem | undefined;
  diffArtificialRecordStoreId: string;
  diffBeforeArtificialRecordStoreId?: string;
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

// OMNIA-CUSTOM: muted + struck-through styling for the before-value preview.
const StyledBeforeValue = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-flex;
  gap: ${themeCssVariables.spacing[1]};
  text-decoration: line-through;
`;

const StyledArrow = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
`;

export const EventFieldDiff = ({
  diffRecord,
  diffBeforeRecord,
  mainObjectMetadataItem,
  fieldMetadataItem,
  diffArtificialRecordStoreId,
  diffBeforeArtificialRecordStoreId,
}: EventFieldDiffProps) => {
  if (!fieldMetadataItem) {
    throw new Error('fieldMetadataItem is required');
  }

  const isValueEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === '';

  const isObjectEmpty = (obj: Record<string, unknown>): boolean =>
    Object.values(obj).every(isValueEmpty);

  const isRelationField =
    fieldMetadataItem.type === FieldMetadataType.RELATION ||
    fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION;

  const isUpdatedToEmpty =
    isValueEmpty(diffRecord) ||
    (!isRelationField &&
      typeof diffRecord === 'object' &&
      diffRecord !== null &&
      isObjectEmpty(diffRecord));

  // OMNIA-CUSTOM: only render the before preview when we actually have a
  // non-empty previous value AND a dedicated record-store id for it.
  const isBeforeEmpty =
    !diffBeforeRecord ||
    isValueEmpty(diffBeforeRecord) ||
    (typeof diffBeforeRecord === 'object' &&
      diffBeforeRecord !== null &&
      isObjectEmpty(diffBeforeRecord as Record<string, unknown>));

  const showBeforeValue =
    !isBeforeEmpty && isDefined(diffBeforeArtificialRecordStoreId);

  return (
    <StyledEventFieldDiffContainer>
      <EventFieldDiffLabel fieldMetadataItem={fieldMetadataItem} />
      {showBeforeValue && (
        <>
          <StyledBeforeValue>
            {isRelationField ? (
              <EventFieldDiffRelationValue
                diffRecord={diffBeforeRecord as Record<string, unknown>}
                fieldMetadataItem={fieldMetadataItem}
              />
            ) : (
              <>
                <EventFieldDiffValueEffect
                  diffArtificialRecordStoreId={
                    diffBeforeArtificialRecordStoreId as string
                  }
                  mainObjectMetadataItem={mainObjectMetadataItem}
                  fieldMetadataItem={fieldMetadataItem}
                  diffRecord={diffBeforeRecord as Record<string, unknown>}
                />
                <EventFieldDiffValue
                  diffArtificialRecordStoreId={
                    diffBeforeArtificialRecordStoreId as string
                  }
                  mainObjectMetadataItem={mainObjectMetadataItem}
                  fieldMetadataItem={fieldMetadataItem}
                />
              </>
            )}
          </StyledBeforeValue>
          <StyledArrow>→</StyledArrow>
        </>
      )}
      {!showBeforeValue && <>→</>}
      {isUpdatedToEmpty ? (
        <StyledEmptyValue>
          <Trans>Empty</Trans>
        </StyledEmptyValue>
      ) : isRelationField ? (
        <EventFieldDiffRelationValue
          diffRecord={diffRecord}
          fieldMetadataItem={fieldMetadataItem}
        />
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
