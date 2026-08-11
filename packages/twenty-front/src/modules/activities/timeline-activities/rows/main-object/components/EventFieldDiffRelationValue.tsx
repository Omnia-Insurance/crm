import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { RecordChip } from '@/object-record/components/RecordChip';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { ChipVariant } from 'twenty-ui/data-display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type EventFieldDiffRelationValueProps = {
  diffRecord: unknown;
  fieldMetadataItem: FieldMetadataItem;
};

const StyledEmptyValue = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
`;

export const EventFieldDiffRelationValue = ({
  diffRecord,
  fieldMetadataItem,
}: EventFieldDiffRelationValueProps) => {
  const relationObjectNameSingular =
    fieldMetadataItem.relation?.targetObjectMetadata.nameSingular ?? '';

  // OMNIA-CUSTOM: the server now emits relation diffs as { id: uuid } objects,
  // but legacy diffs pass a bare string UUID. Accept both shapes so the chip
  // resolves either way; a cleared relation ({ id: null }) yields no valid id.
  const recordId =
    typeof diffRecord === 'string'
      ? diffRecord
      : typeof diffRecord === 'object' &&
          diffRecord !== null &&
          'id' in diffRecord
        ? (diffRecord as { id: string | null }).id
        : null;

  const isValidId = typeof recordId === 'string' && recordId.length > 0;

  const { record, loading } = useFindOneRecord({
    objectNameSingular: relationObjectNameSingular,
    objectRecordId: isValidId ? recordId : undefined,
    skip: !relationObjectNameSingular || !isValidId,
  });

  if (!isValidId) {
    return (
      <StyledEmptyValue>
        <Trans>Empty</Trans>
      </StyledEmptyValue>
    );
  }

  if (loading || !record) {
    return null;
  }

  return (
    <RecordChip
      objectNameSingular={relationObjectNameSingular}
      record={record}
      variant={ChipVariant.Transparent}
      forceDisableClick
    />
  );
};
