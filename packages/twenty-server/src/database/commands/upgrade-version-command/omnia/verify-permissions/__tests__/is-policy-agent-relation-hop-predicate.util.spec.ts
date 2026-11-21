import { RowLevelPermissionPredicateOperand } from 'twenty-shared/types';

import {
  buildFlatEntityMapsMock,
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { isPolicyAgentRelationHopPredicate } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/is-policy-agent-relation-hop-predicate.util';

const isHop = (
  overrides: Partial<typeof MEMBER_POLICY_HOP_PREDICATE_MOCK> = {},
  flatFieldMetadataMaps = VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
) =>
  isPolicyAgentRelationHopPredicate({
    predicate: { ...MEMBER_POLICY_HOP_PREDICATE_MOCK, ...overrides },
    policyObjectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
    flatFieldMetadataMaps,
    flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  });

describe('isPolicyAgentRelationHopPredicate', () => {
  it('should accept the contract C2 shape whatever value is stored, beside the agentProfile manager relation', () => {
    expect(isHop()).toBe(true);
    expect(isHop({ value: 'ignored' })).toBe(true);
  });

  it('should reject another operand, a sub field or a direct comparison', () => {
    expect(isHop({ operand: RowLevelPermissionPredicateOperand.IS_NOT })).toBe(
      false,
    );
    expect(isHop({ subFieldName: 'name' })).toBe(false);
    expect(isHop({ relationFieldMetadataId: null })).toBe(false);
  });

  it('should reject a hop compared with a workspace member field other than id', () => {
    expect(
      isHop({
        workspaceMemberFieldMetadataId:
          VERIFY_PERMISSIONS_IDS.workspaceMemberAgentProfilesField,
      }),
    ).toBe(false);
  });

  it('should reject a hop through agentProfile.manager, which lets managers write their agents policies', () => {
    expect(
      isHop({
        fieldMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileManagerField,
      }),
    ).toBe(false);
  });

  it('should reject a hop when agentProfile has no relation named workspaceMember', () => {
    const flatFieldMetadataMapsWithRenamedRelation = buildFlatEntityMapsMock(
      VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS.map((flatFieldMetadata) =>
        flatFieldMetadata.id ===
        VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField
          ? { ...flatFieldMetadata, name: 'owner' }
          : flatFieldMetadata,
      ),
    );

    expect(isHop({}, flatFieldMetadataMapsWithRenamedRelation)).toBe(false);
  });
});
