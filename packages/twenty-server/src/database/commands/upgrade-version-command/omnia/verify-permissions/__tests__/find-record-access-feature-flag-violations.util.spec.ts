import { FeatureFlagKey } from 'twenty-shared/types';

import { findRecordAccessFeatureFlagViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-record-access-feature-flag-violations.util';
import { isRowLevelPermissionRelationHopEnabled } from 'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util';

jest.mock(
  'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util',
  () => ({ isRowLevelPermissionRelationHopEnabled: jest.fn() }),
);

const isRowLevelPermissionRelationHopEnabledMock = jest.mocked(
  isRowLevelPermissionRelationHopEnabled,
);

const HOP_PREDICATE = {
  id: 'hop-predicate-id',
  relationFieldMetadataId: 'policy-agent-field-id',
};

const DIRECT_PREDICATE = {
  id: 'direct-predicate-id',
  relationFieldMetadataId: null,
};

describe('findRecordAccessFeatureFlagViolations', () => {
  beforeEach(() => {
    isRowLevelPermissionRelationHopEnabledMock.mockReturnValue(true);
  });

  it('should pass with the hop flag on and every record access flag off', () => {
    expect(
      findRecordAccessFeatureFlagViolations({
        featureFlagsMap: {
          [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
          [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
        },
        predicates: [HOP_PREDICATE, DIRECT_PREDICATE],
      }),
    ).toEqual([]);
  });

  it('should not require the hop flag when no predicate hops through a relation', () => {
    expect(
      findRecordAccessFeatureFlagViolations({
        featureFlagsMap: {},
        predicates: [DIRECT_PREDICATE],
      }),
    ).toEqual([]);
  });

  it('should report a record access flag that is on and a hop predicate with the hop flag off', () => {
    expect(
      findRecordAccessFeatureFlagViolations({
        featureFlagsMap: {
          [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: true,
        },
        predicates: [HOP_PREDICATE],
      }),
    ).toEqual([
      {
        check: 'record-access-feature-flags',
        message:
          'IS_RECORD_LEVEL_SHARING_ENABLED is on, which grants record access outside the row level permission rules',
        ids: [],
      },
      {
        check: 'record-access-feature-flags',
        message:
          '1 predicate(s) reach their field through a relation but IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED is off, so they match no record',
        ids: ['hop-predicate-id'],
      },
    ]);
  });

  it('should report hop predicates the engine still disables with the hop flag on', () => {
    isRowLevelPermissionRelationHopEnabledMock.mockReturnValue(false);

    expect(
      findRecordAccessFeatureFlagViolations({
        featureFlagsMap: {
          [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
        },
        predicates: [HOP_PREDICATE],
      }).map(({ ids }) => ids),
    ).toEqual([['hop-predicate-id']]);
  });
});
