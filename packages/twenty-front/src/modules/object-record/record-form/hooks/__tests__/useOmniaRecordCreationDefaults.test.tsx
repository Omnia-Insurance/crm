import {
  type CurrentWorkspaceMember,
  currentWorkspaceMemberState,
} from '@/auth/states/currentWorkspaceMemberState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useOmniaRecordCreationDefaults } from '@/object-record/record-form/hooks/useOmniaRecordCreationDefaults';
import {
  type OmniaCurrentAgentProfile,
  omniaCurrentAgentProfileState,
} from '@/object-record/record-form/states/omniaCurrentAgentProfileState';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

let mockObjectMetadataItems: EnrichedObjectMetadataItem[] = [];

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');

const POLICY_LIKE_OBJECT: EnrichedObjectMetadataItem = {
  ...opportunity,
  fields: opportunity.fields.map((field) =>
    field.name === 'owner' && isDefined(field.relation)
      ? {
          ...field,
          relation: {
            ...field.relation,
            targetObjectMetadata: {
              ...field.relation.targetObjectMetadata,
              nameSingular: 'agentProfile',
            },
          },
        }
      : field,
  ),
};

const AGENT_PROFILE_OBJECT: EnrichedObjectMetadataItem = {
  ...getMockObjectMetadataItemOrThrow('company'),
  id: 'agent-profile-object-id',
  nameSingular: 'agentProfile',
  namePlural: 'agentProfiles',
  isActive: true,
};

const CURRENT_WORKSPACE_MEMBER: CurrentWorkspaceMember = {
  id: 'workspace-member-id',
  name: { firstName: 'Avery', lastName: 'Agent' },
  locale: 'en',
  colorScheme: 'System',
  userEmail: 'avery@example.com',
};

const LOADED_AGENT_PROFILE: OmniaCurrentAgentProfile = {
  workspaceMemberId: CURRENT_WORKSPACE_MEMBER.id,
  agentProfileId: 'agent-profile-id',
};

const renderUseOmniaRecordCreationDefaults = ({
  omniaCurrentAgentProfile = LOADED_AGENT_PROFILE,
}: {
  omniaCurrentAgentProfile?: OmniaCurrentAgentProfile | null;
} = {}) => {
  const store = createStore();

  store.set(currentWorkspaceMemberState.atom, CURRENT_WORKSPACE_MEMBER);
  store.set(omniaCurrentAgentProfileState.atom, omniaCurrentAgentProfile);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return renderHook(
    () =>
      useOmniaRecordCreationDefaults({
        objectMetadataItem: POLICY_LIKE_OBJECT,
      }),
    { wrapper },
  );
};

describe('useOmniaRecordCreationDefaults', () => {
  beforeEach(() => {
    mockObjectMetadataItems = [POLICY_LIKE_OBJECT, AGENT_PROFILE_OBJECT];
  });

  it('prefills the Agent with the AgentProfile of the member', () => {
    const { result } = renderUseOmniaRecordCreationDefaults();

    expect(result.current.agentProfileWorkspaceMemberId).toBe(
      CURRENT_WORKSPACE_MEMBER.id,
    );
    expect(
      result.current.applyOmniaRecordCreationDefaults({ name: 'Renewal' }),
    ).toEqual({ name: 'Renewal', ownerId: 'agent-profile-id' });
  });

  it('neither looks up nor prefills an Agent when the workspace has no agentProfile object', () => {
    mockObjectMetadataItems = [POLICY_LIKE_OBJECT];

    const { result } = renderUseOmniaRecordCreationDefaults();
    const draftRecord = { name: 'Renewal' };

    expect(result.current.agentProfileWorkspaceMemberId).toBeUndefined();
    expect(result.current.applyOmniaRecordCreationDefaults(draftRecord)).toBe(
      draftRecord,
    );
  });

  it('keeps an Agent the caller or a row level rule set', () => {
    const { result } = renderUseOmniaRecordCreationDefaults();

    expect(
      result.current.applyOmniaRecordCreationDefaults({
        ownerId: 'agent-profile-from-rls',
      }),
    ).toEqual({ ownerId: 'agent-profile-from-rls' });
  });

  it('fills an empty Agent of the request again on every reset but keeps a clear the user made', () => {
    const { result } = renderUseOmniaRecordCreationDefaults();

    expect(
      result.current.applyOmniaRecordCreationDefaults({ ownerId: null }),
    ).toEqual({ ownerId: 'agent-profile-id' });
    expect(
      result.current.applyOmniaRecordCreationDefaults({ ownerId: null }),
    ).toEqual({ ownerId: 'agent-profile-id' });
    expect(
      result.current.applyOmniaRecordCreationDefaults(
        { ownerId: null },
        { shouldKeepNullValues: true },
      ),
    ).toEqual({ ownerId: null });
  });

  it('ignores an AgentProfile loaded for someone else', () => {
    const { result } = renderUseOmniaRecordCreationDefaults({
      omniaCurrentAgentProfile: {
        workspaceMemberId: 'previous-workspace-member-id',
        agentProfileId: 'previous-agent-profile-id',
      },
    });

    expect(result.current.applyOmniaRecordCreationDefaults({})).toEqual({});
  });
});
