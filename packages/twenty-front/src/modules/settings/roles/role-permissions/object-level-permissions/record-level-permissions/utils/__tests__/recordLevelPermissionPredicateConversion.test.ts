import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { findWorkspaceMemberHop } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';
import {
  convertPredicateToRecordFilter,
  convertRecordFilterToPredicate,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion';
import {
  AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
  buildPolicyAgentHopPredicate,
  POLICY_AGENT_FIELD_METADATA_ID,
  POLICY_ASSIGNEE_FIELD_METADATA_ID,
  POLICY_OBJECT_METADATA_ITEM,
  TEST_ROLE_ID,
  TEST_ROOT_PREDICATE_GROUP_ID,
  WORKSPACE_MEMBER_HOP_TEST_METADATA,
  WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';
import { isDefined } from 'twenty-shared/utils';
import { ViewFilterOperand } from 'twenty-shared/types';
import { RowLevelPermissionPredicateOperand } from '~/generated-metadata/graphql';

const getPolicyFieldOrThrow = (fieldMetadataId: string) => {
  const fieldMetadataItem = POLICY_OBJECT_METADATA_ITEM.fields.find(
    (field) => field.id === fieldMetadataId,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`Missing policy field ${fieldMetadataId}`);
  }

  return fieldMetadataItem;
};

const buildMeRecordFilter = ({
  fieldMetadataId,
  label,
  operand = ViewFilterOperand.IS,
}: {
  fieldMetadataId: string;
  label: string;
  operand?: ViewFilterOperand;
}): RecordFilter => ({
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0201',
  fieldMetadataId,
  value: '',
  displayValue: '',
  type: 'RELATION',
  operand,
  label,
  subFieldName: null,
  recordFilterGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
  positionInRecordFilterGroup: 0,
  rlsDynamicValue: {
    workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
    workspaceMemberSubFieldName: null,
  },
});

const convertWithWorkspaceMemberHop = (recordFilter: RecordFilter) =>
  convertRecordFilterToPredicate(
    recordFilter,
    TEST_ROLE_ID,
    POLICY_OBJECT_METADATA_ITEM.id,
    findWorkspaceMemberHop({
      relationFieldMetadataId: recordFilter.fieldMetadataId,
      workspaceMemberFieldMetadataId:
        recordFilter.rlsDynamicValue?.workspaceMemberFieldMetadataId,
      ...WORKSPACE_MEMBER_HOP_TEST_METADATA,
    }),
  );

describe('convertRecordFilterToPredicate', () => {
  it('saves "Agent is Me" as the C2 hop', () => {
    const predicate = convertWithWorkspaceMemberHop(
      buildMeRecordFilter({
        fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        label: 'Agent',
      }),
    );

    expect(predicate).toEqual({
      __typename: 'RowLevelPermissionPredicate',
      id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0201',
      roleId: TEST_ROLE_ID,
      objectMetadataId: POLICY_OBJECT_METADATA_ITEM.id,
      relationFieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
      fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
      operand: RowLevelPermissionPredicateOperand.IS,
      value: null,
      subFieldName: null,
      workspaceMemberSubFieldName: null,
      rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
      positionInRowLevelPermissionPredicateGroup: 0,
    });
  });

  it('never saves the legacy policy.agent = workspaceMember.id comparison', () => {
    for (const operand of [ViewFilterOperand.IS, ViewFilterOperand.IS_NOT]) {
      const predicate = convertWithWorkspaceMemberHop(
        buildMeRecordFilter({
          fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
          label: 'Agent',
          operand,
        }),
      );

      expect(predicate.fieldMetadataId).not.toBe(
        POLICY_AGENT_FIELD_METADATA_ID,
      );
      expect(predicate.relationFieldMetadataId).toBe(
        POLICY_AGENT_FIELD_METADATA_ID,
      );
      expect(predicate.operand).toBe(operand);
    }
  });

  it('keeps "Assignee is Me" as a direct workspace member comparison', () => {
    const predicate = convertWithWorkspaceMemberHop(
      buildMeRecordFilter({
        fieldMetadataId: POLICY_ASSIGNEE_FIELD_METADATA_ID,
        label: 'Assignee',
      }),
    );

    expect(predicate).toMatchObject({
      fieldMetadataId: POLICY_ASSIGNEE_FIELD_METADATA_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
      value: null,
    });
    expect(predicate.relationFieldMetadataId).toBeUndefined();
  });
});

describe('convertPredicateToRecordFilter', () => {
  it('shows the C2 hop as an "Agent is Me" row on the relation field', () => {
    const recordFilter = convertPredicateToRecordFilter(
      buildPolicyAgentHopPredicate({
        rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
        positionInRowLevelPermissionPredicateGroup: 0,
      }),
      getPolicyFieldOrThrow(POLICY_AGENT_FIELD_METADATA_ID),
    );

    expect(recordFilter).toMatchObject({
      fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
      label: 'Agent',
      type: 'RELATION',
      operand: ViewFilterOperand.IS,
      value: '',
      recordFilterGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
      positionInRecordFilterGroup: 0,
      rlsDynamicValue: {
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        workspaceMemberSubFieldName: null,
      },
    });
  });

  it('round-trips the C2 hop unchanged', () => {
    const hopPredicate = buildPolicyAgentHopPredicate({
      rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
      positionInRowLevelPermissionPredicateGroup: 2,
    });

    const recordFilter = convertPredicateToRecordFilter(
      hopPredicate,
      getPolicyFieldOrThrow(POLICY_AGENT_FIELD_METADATA_ID),
    );

    if (!isDefined(recordFilter)) {
      throw new Error('Expected the hop to load as a record filter');
    }

    expect(convertWithWorkspaceMemberHop(recordFilter)).toEqual(hopPredicate);
  });
});
