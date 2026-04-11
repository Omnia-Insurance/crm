import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useDraftRecordDefaults } from '@/object-record/hooks/useDraftRecordDefaults';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useBuildRecordInputFromFilters } from '@/object-record/record-table/hooks/useBuildRecordInputFromFilters';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

type UseCreateNewIndexRecordProps = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  instanceId?: string;
};

export const useCreateNewIndexRecord = ({
  objectMetadataItem,
  instanceId,
}: UseCreateNewIndexRecordProps) => {
  const store = useStore();

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const { buildRecordInputFromFilters } = useBuildRecordInputFromFilters({
    objectMetadataItem,
    instanceId,
  });

  const { buildDraftSeeds } = useDraftRecordDefaults({ objectMetadataItem });

  const openDraftInSidePanel = useCallback(
    (recordInput?: Partial<ObjectRecord>) => {
      const recordId = v4();
      const { position, ...restRecordInput } = recordInput ?? {};

      const { seedValues: draftSeeds, rlsFieldNames } = buildDraftSeeds({
        includeRestrictedFields: true,
      });
      const recordInputFromFilters = buildRecordInputFromFilters();

      const seedValues = {
        id: recordId,
        ...draftSeeds,
        ...recordInputFromFilters,
        ...restRecordInput,
      } as ObjectRecord;

      // 1. Seed draft in record store
      store.set(recordStoreFamilyState.atomFamily(recordId), seedValues);

      // 2. Track as draft with metadata
      const draftMap = new Map(store.get(draftRecordIdsState.atom));
      draftMap.set(recordId, {
        objectNameSingular: objectMetadataItem.nameSingular,
        objectMetadataItem,
        hiddenFieldNames: new Set(['position', ...rlsFieldNames]),
        extraRecordInput: isDefined(position) ? { position } : {},
      });
      store.set(draftRecordIdsState.atom, draftMap);

      // 3. Open side panel with draft
      openRecordInSidePanel({
        recordId,
        objectNameSingular: objectMetadataItem.nameSingular,
        isNewRecord: true,
      });
    },
    [
      store,
      buildDraftSeeds,
      buildRecordInputFromFilters,
      objectMetadataItem,
      openRecordInSidePanel,
    ],
  );

  return {
    openDraftInSidePanel,
  };
};
