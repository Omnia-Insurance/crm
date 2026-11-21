import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { AGENT_PROFILE_OBJECT_NAME_SINGULAR } from '@/object-record/record-form/constants/AgentProfileObjectNameSingular';
import { omniaCurrentAgentProfileState } from '@/object-record/record-form/states/omniaCurrentAgentProfileState';
import { applyAgentProfileJoinColumnDefaults } from '@/object-record/record-form/utils/applyAgentProfileJoinColumnDefaults';
import { getAgentProfileJoinColumnNames } from '@/object-record/record-form/utils/getAgentProfileJoinColumnNames';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCallback, useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

export const useOmniaRecordCreationDefaults = ({
  objectMetadataItem,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
}) => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const omniaCurrentAgentProfile = useAtomStateValue(
    omniaCurrentAgentProfileState,
  );
  const { objectMetadataItems } = useObjectMetadataItems();

  const agentProfileJoinColumnNames = useMemo(
    () => getAgentProfileJoinColumnNames(objectMetadataItem.fields),
    [objectMetadataItem.fields],
  );

  const hasAgentProfileObject = objectMetadataItems.some(
    (candidate) =>
      candidate.nameSingular === AGENT_PROFILE_OBJECT_NAME_SINGULAR &&
      candidate.isActive,
  );

  const agentProfileWorkspaceMemberId =
    hasAgentProfileObject && agentProfileJoinColumnNames.length > 0
      ? currentWorkspaceMember?.id
      : undefined;

  // The loaded profile belongs to whoever was signed in when it was fetched
  const agentProfileId =
    isDefined(agentProfileWorkspaceMemberId) &&
    omniaCurrentAgentProfile?.workspaceMemberId ===
      agentProfileWorkspaceMemberId
      ? omniaCurrentAgentProfile.agentProfileId
      : null;

  const applyOmniaRecordCreationDefaults = useCallback(
    (
      draftRecord: Partial<ObjectRecord>,
      { shouldKeepNullValues = false }: { shouldKeepNullValues?: boolean } = {},
    ) =>
      applyAgentProfileJoinColumnDefaults({
        draftRecord,
        agentProfileJoinColumnNames,
        agentProfileId,
        shouldKeepNullValues,
      }),
    [agentProfileId, agentProfileJoinColumnNames],
  );

  return { applyOmniaRecordCreationDefaults, agentProfileWorkspaceMemberId };
};
