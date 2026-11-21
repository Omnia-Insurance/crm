import { type MockedResponse } from '@apollo/client/testing';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
  type RowLevelRecordsPermissions,
} from 'twenty-shared/types';

import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import {
  type CurrentWorkspaceMember,
  currentWorkspaceMemberState,
} from '@/auth/states/currentWorkspaceMemberState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type FieldMetadataItemRelation } from '@/object-metadata/types/FieldMetadataItemRelation';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { generateFindManyRecordsQuery } from '@/object-record/utils/generateFindManyRecordsQuery';
import { RelationType } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';

const mockUseFindOneRecord = jest.fn();

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (args: unknown) => mockUseFindOneRecord(args),
}));

const MY_WORKSPACE_MEMBER: CurrentWorkspaceMember = {
  id: '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7',
  name: { firstName: 'Avery', lastName: 'Agent' },
  locale: 'en',
  colorScheme: 'Light',
  userEmail: 'avery.agent@example.com',
};
const MY_AGENT_PROFILE_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const ROLE_ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

const companyMetadata = getMockObjectMetadataItemOrThrow('company');
const workspaceMemberMetadata =
  getMockObjectMetadataItemOrThrow('workspaceMember');
const idFieldTemplate = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: companyMetadata,
  fieldName: 'id',
});
const companyAccountOwnerField = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: companyMetadata,
  fieldName: 'accountOwner',
});
const workspaceMemberIdField = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: workspaceMemberMetadata,
  fieldName: 'id',
});

type ObjectReference = FieldMetadataItemRelation['targetObjectMetadata'];

const AGENT_PROFILE: ObjectReference = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  nameSingular: 'agentProfile',
  namePlural: 'agentProfiles',
};
const POLICY: ObjectReference = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  nameSingular: 'policy',
  namePlural: 'policies',
};
const WORKSPACE_MEMBER: ObjectReference = {
  id: workspaceMemberMetadata.id,
  nameSingular: workspaceMemberMetadata.nameSingular,
  namePlural: workspaceMemberMetadata.namePlural,
};

const buildManyToOneRelationField = ({
  id,
  name,
  sourceObjectMetadata,
  targetObjectMetadata,
}: {
  id: string;
  name: string;
  sourceObjectMetadata: ObjectReference;
  targetObjectMetadata: ObjectReference;
}): FieldMetadataItem => ({
  ...companyAccountOwnerField,
  id,
  name,
  label: name,
  settings: {
    ...companyAccountOwnerField.settings,
    joinColumnName: `${name}Id`,
  },
  relation: {
    type: RelationType.MANY_TO_ONE,
    sourceObjectMetadata,
    targetObjectMetadata,
    sourceFieldMetadata: { id, name },
    targetFieldMetadata: {
      id: `${id}-inverse`,
      name: sourceObjectMetadata.namePlural,
    },
  },
});

// The metadata mocks carry no Omnia objects, so policy and agentProfile are shaped from company
const buildObjectMetadataItem = ({
  objectReference,
  idFieldId,
  relationField,
}: {
  objectReference: ObjectReference;
  idFieldId: string;
  relationField: FieldMetadataItem;
}): EnrichedObjectMetadataItem => {
  const fields = [{ ...idFieldTemplate, id: idFieldId }, relationField];

  return {
    ...companyMetadata,
    ...objectReference,
    labelSingular: objectReference.nameSingular,
    labelPlural: objectReference.namePlural,
    labelIdentifierFieldMetadataId: idFieldId,
    fields,
    readableFields: fields,
    updatableFields: fields,
    indexMetadatas: [],
    searchFieldMetadatas: [],
  };
};

const agentProfileWorkspaceMemberField = buildManyToOneRelationField({
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  name: 'workspaceMember',
  sourceObjectMetadata: AGENT_PROFILE,
  targetObjectMetadata: WORKSPACE_MEMBER,
});
const policyAgentField = buildManyToOneRelationField({
  id: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
  name: 'agent',
  sourceObjectMetadata: POLICY,
  targetObjectMetadata: AGENT_PROFILE,
});

const agentProfileMetadata = buildObjectMetadataItem({
  objectReference: AGENT_PROFILE,
  idFieldId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  relationField: agentProfileWorkspaceMemberField,
});
const policyMetadata = buildObjectMetadataItem({
  objectReference: POLICY,
  idFieldId: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a',
  relationField: policyAgentField,
});

const OBJECT_METADATA_ITEMS = [
  ...getTestEnrichedObjectMetadataItemsMock(),
  agentProfileMetadata,
  policyMetadata,
];

// Contract C2: policy.agent ▸ agentProfile.workspaceMember IS Me
const AGENT_IS_ME_HOP_PREDICATE: RowLevelPermissionPredicate = {
  id: 'agent-is-me-predicate-id',
  roleId: ROLE_ID,
  objectMetadataId: POLICY.id,
  relationFieldMetadataId: policyAgentField.id,
  fieldMetadataId: agentProfileWorkspaceMemberField.id,
  workspaceMemberFieldMetadataId: workspaceMemberIdField.id,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
};

const ACCOUNT_OWNER_IS_ME_PREDICATE: RowLevelPermissionPredicate = {
  id: 'account-owner-is-me-predicate-id',
  roleId: ROLE_ID,
  objectMetadataId: companyMetadata.id,
  relationFieldMetadataId: null,
  fieldMetadataId: companyAccountOwnerField.id,
  workspaceMemberFieldMetadataId: workspaceMemberIdField.id,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
};

type RecordLevelGrants = {
  canReadAllRecords: boolean;
  ruleGrants: Pick<
    RowLevelRecordsPermissions,
    | 'canCreateRecords'
    | 'canReadRecords'
    | 'canUpdateRecords'
    | 'canSoftDeleteRecords'
    | 'canDestroyRecords'
  >;
};

// Contract C1 canonical shapes
const READ_ALL_WRITE_OWN: RecordLevelGrants = {
  canReadAllRecords: true,
  ruleGrants: {
    canCreateRecords: true,
    canReadRecords: false,
    canUpdateRecords: true,
    canSoftDeleteRecords: false,
    canDestroyRecords: false,
  },
};

const READ_OWN_ONLY: RecordLevelGrants = {
  canReadAllRecords: false,
  ruleGrants: {
    canCreateRecords: false,
    canReadRecords: true,
    canUpdateRecords: false,
    canSoftDeleteRecords: false,
    canDestroyRecords: false,
  },
};

const buildObjectRecordsPermissions = ({
  objectMetadataId,
  predicate,
  grants: { canReadAllRecords, ruleGrants },
}: {
  objectMetadataId: string;
  predicate: RowLevelPermissionPredicate;
  grants: RecordLevelGrants;
}): CurrentUserWorkspace['objectRecordsPermissions'][number] => ({
  objectMetadataId,
  canCreateAllRecords: false,
  canReadAllRecords,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
  rowLevelRecordsPermissions: [
    {
      ruleId: `${predicate.id}-rule-id`,
      ...ruleGrants,
      predicates: [predicate],
      predicateGroups: [],
      unreadableFields: [],
      uneditableFields: [],
    },
  ],
});

const MY_AGENT_PROFILE_FILTER = {
  workspaceMemberId: { eq: MY_WORKSPACE_MEMBER.id },
};

const buildAgentProfileLookup = ({
  agentProfileIds,
}: {
  agentProfileIds: string[];
}) => {
  // Answers like the server: only the member's own profiles match the filter
  const respond = jest.fn((variables: Record<string, unknown>) => {
    const matchingAgentProfileIds = isDeeplyEqual(
      variables.filter,
      MY_AGENT_PROFILE_FILTER,
    )
      ? agentProfileIds
      : [];

    return {
      data: {
        agentProfiles: {
          __typename: 'AgentProfileConnection',
          edges: matchingAgentProfileIds.map((agentProfileId) => ({
            __typename: 'AgentProfileEdge',
            cursor: agentProfileId,
            node: { __typename: 'AgentProfile', id: agentProfileId },
          })),
          pageInfo: {
            __typename: 'PageInfo',
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
          totalCount: matchingAgentProfileIds.length,
        },
      },
    };
  });

  const apolloMock: MockedResponse = {
    request: {
      query: generateFindManyRecordsQuery({
        objectMetadataItem: agentProfileMetadata,
        objectMetadataItems: OBJECT_METADATA_ITEMS,
        recordGqlFields: { id: true },
        objectPermissionsByObjectMetadataId: {},
      }),
      variables: () => true,
    },
    delay: 0,
    result: respond,
  };

  return { respond, apolloMock };
};

const renderUseBuildRecordInputFromRLSPredicates = ({
  objectMetadataItem,
  objectRecordsPermissions,
  apolloMocks,
}: {
  objectMetadataItem?: EnrichedObjectMetadataItem;
  objectRecordsPermissions: CurrentUserWorkspace['objectRecordsPermissions'];
  apolloMocks: MockedResponse[];
}) =>
  renderHook(
    () => useBuildRecordInputFromRLSPredicates({ objectMetadataItem }),
    {
      wrapper: getJestMetadataAndApolloMocksWrapper({
        apolloMocks,
        objectMetadataItems: OBJECT_METADATA_ITEMS,
        onInitializeJotaiStore: (store) => {
          store.set(currentWorkspaceMemberState.atom, MY_WORKSPACE_MEMBER);
          store.set(currentUserWorkspaceState.atom, {
            permissionFlags: [],
            twoFactorAuthenticationMethodSummary: [],
            isImpersonating: false,
            objectRecordsPermissions,
          });
        },
      }),
    },
  );

const settlePendingRequests = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe('useBuildRecordInputFromRLSPredicates', () => {
  beforeEach(() => {
    mockUseFindOneRecord.mockReturnValue({
      record: { __typename: 'WorkspaceMember', id: MY_WORKSPACE_MEMBER.id },
      loading: false,
    });
  });

  it('prefills the current member AgentProfile id under agentId for the Agent is Me hop', async () => {
    const agentProfileLookup = buildAgentProfileLookup({
      agentProfileIds: [MY_AGENT_PROFILE_ID],
    });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectMetadataItem: policyMetadata,
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: POLICY.id,
          predicate: AGENT_IS_ME_HOP_PREDICATE,
          grants: READ_ALL_WRITE_OWN,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    await waitFor(() =>
      expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({
        agentId: MY_AGENT_PROFILE_ID,
      }),
    );
    expect(agentProfileLookup.respond).toHaveBeenCalledWith(
      expect.objectContaining({ filter: MY_AGENT_PROFILE_FILTER, limit: 1 }),
    );
  });

  it('omits agentId without throwing when the member has no AgentProfile', async () => {
    const agentProfileLookup = buildAgentProfileLookup({ agentProfileIds: [] });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectMetadataItem: policyMetadata,
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: POLICY.id,
          predicate: AGENT_IS_ME_HOP_PREDICATE,
          grants: READ_ALL_WRITE_OWN,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({});

    await waitFor(() => expect(agentProfileLookup.respond).toHaveBeenCalled());
    await settlePendingRequests();

    expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({});
  });

  it('gives no prefill and fetches no AgentProfile for a read-only rule', async () => {
    const agentProfileLookup = buildAgentProfileLookup({
      agentProfileIds: [MY_AGENT_PROFILE_ID],
    });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectMetadataItem: policyMetadata,
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: POLICY.id,
          predicate: AGENT_IS_ME_HOP_PREDICATE,
          grants: READ_OWN_ONLY,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    await settlePendingRequests();

    expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({});
    expect(agentProfileLookup.respond).not.toHaveBeenCalled();
  });

  it('skips the hop for a call-time object, as on the junction path', async () => {
    const agentProfileLookup = buildAgentProfileLookup({
      agentProfileIds: [MY_AGENT_PROFILE_ID],
    });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: POLICY.id,
          predicate: AGENT_IS_ME_HOP_PREDICATE,
          grants: READ_ALL_WRITE_OWN,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    await settlePendingRequests();

    expect(
      result.current.buildRecordInputFromRLSPredicates({
        objectMetadataItem: policyMetadata,
      }),
    ).toEqual({});
    expect(agentProfileLookup.respond).not.toHaveBeenCalled();
  });

  it('keeps the hop prefill to the hook-level object', async () => {
    const agentProfileLookup = buildAgentProfileLookup({
      agentProfileIds: [MY_AGENT_PROFILE_ID],
    });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectMetadataItem: policyMetadata,
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: POLICY.id,
          predicate: AGENT_IS_ME_HOP_PREDICATE,
          grants: READ_ALL_WRITE_OWN,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    await waitFor(() =>
      expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({
        agentId: MY_AGENT_PROFILE_ID,
      }),
    );
    expect(
      result.current.buildRecordInputFromRLSPredicates({
        objectMetadataItem: companyMetadata,
      }),
    ).toEqual({});
  });

  it('keeps the upstream prefill for a direct workspace member predicate', async () => {
    const agentProfileLookup = buildAgentProfileLookup({
      agentProfileIds: [MY_AGENT_PROFILE_ID],
    });

    const { result } = renderUseBuildRecordInputFromRLSPredicates({
      objectMetadataItem: companyMetadata,
      objectRecordsPermissions: [
        buildObjectRecordsPermissions({
          objectMetadataId: companyMetadata.id,
          predicate: ACCOUNT_OWNER_IS_ME_PREDICATE,
          grants: READ_ALL_WRITE_OWN,
        }),
      ],
      apolloMocks: [agentProfileLookup.apolloMock],
    });

    await settlePendingRequests();

    expect(result.current.buildRecordInputFromRLSPredicates()).toEqual({
      accountOwnerId: MY_WORKSPACE_MEMBER.id,
    });
    expect(agentProfileLookup.respond).not.toHaveBeenCalled();
  });
});
