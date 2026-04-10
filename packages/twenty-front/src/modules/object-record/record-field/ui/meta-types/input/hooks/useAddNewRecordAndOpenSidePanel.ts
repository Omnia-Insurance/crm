import { v4 } from 'uuid';

import { SEARCH_QUERY } from '@/command-menu/graphql/queries/search';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { viewableRecordIdState } from '@/object-record/record-side-panel/states/viewableRecordIdState';
import { viewableRecordNameSingularState } from '@/object-record/record-side-panel/states/viewableRecordNameSingularState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { buildDraftFieldDefaults } from '@/object-record/utils/buildDraftFieldDefaults';
import { buildRecordLabelPayload } from '@/object-record/utils/buildRecordLabelPayload';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getOperationName } from '~/utils/getOperationName';
import { computeMorphRelationFieldName, isDefined } from 'twenty-shared/utils';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';
import { useStore } from 'jotai';

type useAddNewRecordAndOpenSidePanelProps = {
  fieldMetadataItem: FieldMetadataItem;
  objectMetadataItem: EnrichedObjectMetadataItem;
  relationObjectMetadataNameSingular: string;
  relationObjectMetadataItem: EnrichedObjectMetadataItem;
  relationFieldMetadataItem: FieldMetadataItem;
  recordId: string;
};

export const useAddNewRecordAndOpenSidePanel = ({
  fieldMetadataItem,
  objectMetadataItem,
  relationObjectMetadataNameSingular,
  relationObjectMetadataItem,
  relationFieldMetadataItem,
  recordId,
}: useAddNewRecordAndOpenSidePanelProps) => {
  const setViewableRecordId = useSetAtomState(viewableRecordIdState);
  const setViewableRecordNameSingular = useSetAtomState(
    viewableRecordNameSingularState,
  );

  const { updateOneRecord } = useUpdateOneRecord();

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const apolloCoreClient = useApolloCoreClient();

  const store = useStore();

  // Pre-fetch agent profile for the current workspace member on the TARGET
  // object (the one being created). Mirrors useCreateNewIndexRecord so that
  // creating a record through a relation (e.g., new Policy from a Lead)
  // prefills the Agent field the same way as creating from the index page.
  const agentRelationField = relationObjectMetadataItem.fields.find(
    (f) =>
      f.type === FieldMetadataType.RELATION &&
      f.relation?.targetObjectMetadata.nameSingular === 'agentProfile',
  );
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const shouldSkipAgentLookup =
    !isDefined(agentRelationField) || !isDefined(currentWorkspaceMember?.id);
  const { records: agentProfiles } = useFindManyRecords({
    // Use the target object as a safe fallback when agentProfile doesn't exist
    // in metadata — the query is skipped anyway via the skip parameter.
    objectNameSingular: isDefined(agentRelationField)
      ? 'agentProfile'
      : relationObjectMetadataNameSingular,
    filter: isDefined(currentWorkspaceMember?.id)
      ? { workspaceMemberId: { eq: currentWorkspaceMember.id } }
      : undefined,
    skip: shouldSkipAgentLookup,
    limit: 1,
  });

  if (
    relationObjectMetadataNameSingular === 'workspaceMember' ||
    !isDefined(objectMetadataItem.nameSingular)
  ) {
    return {
      createNewRecordAndOpenSidePanel: undefined,
    };
  }

  const relationFieldMetadataItemRelationType =
    relationFieldMetadataItem.settings?.relationType;

  return {
    createNewRecordAndOpenSidePanel: (searchInput?: string) => {
      const newRecordId = v4();

      const labelPayload = buildRecordLabelPayload({
        id: newRecordId,
        searchInput,
        objectMetadataItem: relationObjectMetadataItem,
      });

      // Build field defaults (SELECT defaults, system fields, etc.)
      const currentMember = store.get(currentWorkspaceMemberState.atom);
      const fieldDefaults = buildDraftFieldDefaults({
        objectMetadataItem: relationObjectMetadataItem,
        currentMember,
      });

      // Prefill agent from workspace member's agent profile
      if (isDefined(agentRelationField) && agentProfiles.length > 0) {
        fieldDefaults[`${agentRelationField.name}Id`] = agentProfiles[0].id;
        fieldDefaults[agentRelationField.name] = agentProfiles[0];
      }

      const seedValues: Record<string, unknown> = {
        id: newRecordId,
        ...fieldDefaults,
        ...labelPayload,
      };

      if (relationFieldMetadataItemRelationType === RelationType.MANY_TO_ONE) {
        const gqlField =
          relationFieldMetadataItem.type === FieldMetadataType.RELATION
            ? relationFieldMetadataItem.name
            : computeMorphRelationFieldName({
                fieldName: relationFieldMetadataItem.name,
                relationType: relationFieldMetadataItemRelationType,
                targetObjectMetadataNameSingular:
                  objectMetadataItem.nameSingular,
                targetObjectMetadataNamePlural: objectMetadataItem.namePlural,
              });

        seedValues[`${gqlField}Id`] = recordId;

        // Also set the relation object so the display renders the chip
        // (not just the FK). Read the source record from the store.
        const sourceRecord = store.get(
          recordStoreFamilyState.atomFamily(recordId),
        );
        if (isDefined(sourceRecord)) {
          seedValues[gqlField] = sourceRecord;
        }
      }

      // Seed draft in record store
      store.set(
        recordStoreFamilyState.atomFamily(newRecordId),
        seedValues as ObjectRecord,
      );

      // Track as draft
      const draftMap = new Map(store.get(draftRecordIdsState.atom));
      draftMap.set(newRecordId, {
        objectNameSingular: relationObjectMetadataNameSingular,
        objectMetadataItem: relationObjectMetadataItem,
        hiddenFieldNames: new Set(['position']),
        extraRecordInput: {},
        onRecordCreated: async (createdRecord) => {
          if (
            relationFieldMetadataItemRelationType === RelationType.ONE_TO_MANY
          ) {
            await updateOneRecord({
              objectNameSingular:
                objectMetadataItem.nameSingular ?? 'workspaceMember',
              idToUpdate: recordId,
              updateOneRecordInput: {
                [`${fieldMetadataItem.name}Id`]: createdRecord.id,
              },
            });
          }

          setViewableRecordId(createdRecord.id);
          setViewableRecordNameSingular(relationObjectMetadataNameSingular);

          apolloCoreClient.refetchQueries({
            include: [getOperationName(SEARCH_QUERY) ?? ''],
          });
        },
      });
      store.set(draftRecordIdsState.atom, draftMap);

      // Open side panel with draft
      openRecordInSidePanel({
        recordId: newRecordId,
        objectNameSingular: relationObjectMetadataNameSingular,
        isNewRecord: true,
      });
    },
  };
};
