import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type OmniaCurrentAgentProfile = {
  workspaceMemberId: string;
  agentProfileId: string | null;
};

export const omniaCurrentAgentProfileState =
  createAtomState<OmniaCurrentAgentProfile | null>({
    key: 'omniaCurrentAgentProfileState',
    defaultValue: null,
  });
