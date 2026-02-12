import { useMemo } from 'react';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { detectJunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

type UseJunctionBridgeFilterArgs = {
  objectMetadataItem: ObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem;
  recordId: string;
  objectMetadataItems: ObjectMetadataItem[];
  recordData: Record<string, unknown> | null | undefined;
};

export const useJunctionBridgeFilter = ({
  objectMetadataItem,
  fieldMetadataItem,
  recordData,
  objectMetadataItems,
}: UseJunctionBridgeFilterArgs): ObjectRecordFilterInput | undefined => {
  const bridge = useMemo(
    () =>
      detectJunctionBridge({
        objectMetadataItem,
        fieldMetadataItem,
        objectMetadataItems,
      }),
    [objectMetadataItem, fieldMetadataItem, objectMetadataItems],
  );

  const parentValue = recordData?.[bridge?.parentFieldName ?? ''] as
    | { id: string }
    | null
    | undefined;

  const parentId = parentValue?.id;

  const junctionFilter: RecordGqlOperationFilter | undefined = isDefined(
    bridge,
  )
    ? isDefined(parentId)
      ? { [bridge.sourceJoinColumnName]: { eq: parentId } }
      : undefined
    : undefined;

  // When bridge is null, skip is true so the query won't execute.
  // We still need a valid objectNameSingular because useFindManyRecords
  // unconditionally calls useObjectMetadataItem (React hooks can't be conditional),
  // which throws on empty string. Use 'person' as a safe placeholder.
  const { records: junctionRecords } = useFindManyRecords({
    objectNameSingular: bridge?.junctionObjectNameSingular ?? 'person',
    filter: junctionFilter,
    skip: !isDefined(bridge) || !isDefined(parentId),
  });

  return useMemo(() => {
    if (!isDefined(bridge) || !isDefined(parentId)) {
      return undefined;
    }

    const targetIds = junctionRecords
      .map(
        (record) => record[bridge.targetJoinColumnName] as string | undefined,
      )
      .filter((id): id is string => isDefined(id));

    if (targetIds.length === 0) {
      return { id: { in: [] } } as ObjectRecordFilterInput;
    }

    return { id: { in: targetIds } } as ObjectRecordFilterInput;
  }, [bridge, parentId, junctionRecords]);
};
