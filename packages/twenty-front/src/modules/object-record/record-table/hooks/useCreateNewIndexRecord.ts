import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useBuildRecordInputFromFilters } from '@/object-record/record-table/hooks/useBuildRecordInputFromFilters';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { buildDraftFieldDefaults } from '@/object-record/utils/buildDraftFieldDefaults';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
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

  const { buildRecordInputFromRLSPredicates } =
    useBuildRecordInputFromRLSPredicates({
      objectMetadataItem,
    });

  // Pre-fetch agent profile for the current workspace member.
  // This is a fallback for when RLS predicates don't resolve the agent field
  // (e.g., admin role without "Agent is Me" RLS, or restricted field skipping).
  const agentRelationField = objectMetadataItem.fields.find(
    (f) =>
      f.type === 'RELATION' &&
      f.relation?.targetObjectMetadata.nameSingular === 'agentProfile',
  );
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const shouldSkipAgentLookup =
    !isDefined(agentRelationField) || !isDefined(currentWorkspaceMember?.id);
  const { records: agentProfiles } = useFindManyRecords({
    // Use the current object as a safe fallback when agentProfile doesn't exist
    // in metadata — the query is skipped anyway via the skip parameter.
    objectNameSingular: isDefined(agentRelationField)
      ? 'agentProfile'
      : objectMetadataItem.nameSingular,
    filter: isDefined(currentWorkspaceMember?.id)
      ? { workspaceMemberId: { eq: currentWorkspaceMember.id } }
      : undefined,
    skip: shouldSkipAgentLookup,
    limit: 1,
  });

  const openDraftInSidePanel = useCallback(
    (recordInput?: Partial<ObjectRecord>) => {
      const recordId = v4();
      const recordInputFromRLSPredicates = buildRecordInputFromRLSPredicates({
        includeRestrictedFields: true,
      });
      const recordInputFromFilters = buildRecordInputFromFilters();

      const { position, ...restRecordInput } = recordInput ?? {};

      // Build default values from field metadata + system fields
      const currentMember = store.get(currentWorkspaceMemberState.atom);
      const fieldDefaults = buildDraftFieldDefaults({
        objectMetadataItem,
        currentMember,
      });

      // Prefill agent from workspace member's agent profile
      if (
        isDefined(agentRelationField) &&
        agentProfiles.length > 0
      ) {
        fieldDefaults[`${agentRelationField.name}Id`] = agentProfiles[0].id;
        fieldDefaults[agentRelationField.name] = agentProfiles[0];
      }

      // Filter out undefined/null values from RLS so they don't overwrite defaults
      const definedRLSValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(recordInputFromRLSPredicates)) {
        if (isDefined(value)) {
          definedRLSValues[key] = value;
        }
      }

      const seedValues = {
        id: recordId,
        ...fieldDefaults,
        ...definedRLSValues,
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
        hiddenFieldNames: new Set([
          'position',
          ...Object.keys(recordInputFromRLSPredicates),
        ]),
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
      agentRelationField,
      agentProfiles,
      store,
      buildRecordInputFromRLSPredicates,
      buildRecordInputFromFilters,
      objectMetadataItem,
      openRecordInSidePanel,
    ],
  );

  return {
    openDraftInSidePanel,
  };
};
