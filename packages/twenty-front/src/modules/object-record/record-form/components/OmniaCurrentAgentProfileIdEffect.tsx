import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { AGENT_PROFILE_OBJECT_NAME_SINGULAR } from '@/object-record/record-form/constants/AgentProfileObjectNameSingular';
import { omniaCurrentAgentProfileState } from '@/object-record/record-form/states/omniaCurrentAgentProfileState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useCallback } from 'react';

type OmniaCurrentAgentProfileIdEffectProps = {
  workspaceMemberId: string;
};

export const OmniaCurrentAgentProfileIdEffect = ({
  workspaceMemberId,
}: OmniaCurrentAgentProfileIdEffectProps) => {
  const setOmniaCurrentAgentProfile = useSetAtomState(
    omniaCurrentAgentProfileState,
  );

  const handleAgentProfilesLoaded = useCallback(
    (agentProfiles: ObjectRecord[]) => {
      const agentProfileId = agentProfiles[0]?.id ?? null;

      setOmniaCurrentAgentProfile((previousOmniaCurrentAgentProfile) =>
        previousOmniaCurrentAgentProfile?.workspaceMemberId ===
          workspaceMemberId &&
        previousOmniaCurrentAgentProfile.agentProfileId === agentProfileId
          ? previousOmniaCurrentAgentProfile
          : { workspaceMemberId, agentProfileId },
      );
    },
    [setOmniaCurrentAgentProfile, workspaceMemberId],
  );

  useFindManyRecords({
    objectNameSingular: AGENT_PROFILE_OBJECT_NAME_SINGULAR,
    filter: { workspaceMemberId: { eq: workspaceMemberId } },
    recordGqlFields: { id: true },
    limit: 1,
    onCompleted: handleAgentProfilesLoaded,
  });

  return null;
};
