import { QUERY_MAX_RECORDS_FROM_RELATION } from 'twenty-shared/constants';
import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type RecordExportRelationSubFieldPlan } from 'src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type';
import { flattenRelationSubFieldExportValues } from 'src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const authContext = {
  type: 'user',
  workspace: { id: 'workspace-id' },
} as unknown as WorkspaceAuthContext;

const buildWorkspaceOrmManager = ({
  countRows = [],
  isReadDisabled = false,
}: {
  countRows?: { parentId: string; childCount: string }[];
  isReadDisabled?: boolean;
} = {}) => {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(countRows),
  };
  const repository = {
    isReadDisabled: jest.fn().mockResolvedValue(isReadDisabled),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn().mockReturnValue(repository),
  };

  return {
    workspaceOrmManager,
    queryBuilder,
    asWorkspaceOrmManager:
      workspaceOrmManager as unknown as WorkspaceOrmManager,
  };
};

const familyMembersPlan: RecordExportRelationSubFieldPlan = {
  cells: [
    {
      kind: 'list',
      key: 'lead__familyMembers',
      relationFieldName: 'lead',
      fieldName: 'familyMembers',
      labelFieldName: 'name',
      childObjectNameSingular: 'familyMember',
      childJoinColumnName: 'leadId',
    },
  ],
  addressFieldNames: [],
};

const buildFamilyMembers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `member-${index}`,
    name: `Member ${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)),
  }));

describe('flattenRelationSubFieldExportValues', () => {
  it('takes the related record id from the root join column when the related record is hidden', async () => {
    const records: ObjectRecord[] = [
      { id: 'policy-1', leadId: 'lead-1', lead: null },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: {
        cells: [
          { kind: 'joinColumn', key: 'lead__id', joinColumnName: 'leadId' },
          {
            kind: 'value',
            key: 'lead__dateOfBirth',
            relationFieldName: 'lead',
            fieldName: 'dateOfBirth',
            isAddress: false,
          },
        ],
        addressFieldNames: [],
      },
      workspaceOrmManager: buildWorkspaceOrmManager().asWorkspaceOrmManager,
      authContext,
    });

    expect(records[0].lead__id).toBe('lead-1');
    expect(records[0].lead__dateOfBirth).toBeUndefined();
  });

  it('writes FULL_NAME labels as "First Last"', async () => {
    const records: ObjectRecord[] = [
      {
        id: 'policy-1',
        agent: { id: 'agent-1', name: { firstName: 'Ann', lastName: 'Lee' } },
        lead: {
          id: 'lead-1',
          leadSource: { id: 'source-1', name: 'Referral' },
        },
      },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: {
        cells: [
          {
            kind: 'label',
            key: 'agent__label',
            recordPath: ['agent'],
            labelFieldName: 'name',
          },
          {
            kind: 'label',
            key: 'lead__leadSource',
            recordPath: ['lead', 'leadSource'],
            labelFieldName: 'name',
          },
          {
            kind: 'label',
            key: 'lead__referrer',
            recordPath: ['lead', 'referrer'],
            labelFieldName: 'name',
          },
        ],
        addressFieldNames: [],
      },
      workspaceOrmManager: buildWorkspaceOrmManager().asWorkspaceOrmManager,
      authContext,
    });

    expect(records[0].agent__label).toBe('Ann Lee');
    expect(records[0].lead__leadSource).toBe('Referral');
    expect(records[0].lead__referrer).toBe('');
  });

  it('lists one-to-many children newest first without counting an uncapped list', async () => {
    const { workspaceOrmManager, asWorkspaceOrmManager } =
      buildWorkspaceOrmManager();
    const records: ObjectRecord[] = [
      {
        id: 'policy-1',
        lead: { id: 'lead-1', familyMembers: buildFamilyMembers(3) },
      },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: familyMembersPlan,
      workspaceOrmManager: asWorkspaceOrmManager,
      authContext,
    });

    expect(records[0].lead__familyMembers).toBe(
      'Member 2 | Member 1 | Member 0',
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('counts a capped list once per page through the permission-checked repository', async () => {
    const { workspaceOrmManager, queryBuilder, asWorkspaceOrmManager } =
      buildWorkspaceOrmManager({
        countRows: [{ parentId: 'lead-1', childCount: '75' }],
      });
    const familyMembers = buildFamilyMembers(QUERY_MAX_RECORDS_FROM_RELATION);
    const sharedLead = { id: 'lead-1', familyMembers };
    const records: ObjectRecord[] = [
      { id: 'policy-1', lead: sharedLead },
      { id: 'policy-2', lead: sharedLead },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: familyMembersPlan,
      workspaceOrmManager: asWorkspaceOrmManager,
      authContext,
    });

    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'familyMember',
      { useReplica: true },
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      '"familyMember"."leadId" IN (:...parentIds)',
      { parentIds: ['lead-1'] },
    );
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
    expect(records[0].lead__familyMembers).toMatch(
      /^Member 59 \| Member 58 \| .* \| Member 0 \| \+15 more$/,
    );
    expect(records[1].lead__familyMembers).toBe(records[0].lead__familyMembers);
  });

  it('skips the count when the requester cannot read the children', async () => {
    const { queryBuilder, asWorkspaceOrmManager } = buildWorkspaceOrmManager({
      isReadDisabled: true,
    });
    const records: ObjectRecord[] = [
      {
        id: 'policy-1',
        lead: {
          id: 'lead-1',
          familyMembers: buildFamilyMembers(QUERY_MAX_RECORDS_FROM_RELATION),
        },
      },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: familyMembersPlan,
      workspaceOrmManager: asWorkspaceOrmManager,
      authContext,
    });

    expect(queryBuilder.getRawMany).not.toHaveBeenCalled();
    expect(records[0].lead__familyMembers).not.toContain('more');
  });

  it('normalizes address states on the exported object and on related records', async () => {
    const records: ObjectRecord[] = [
      {
        id: 'policy-1',
        mailingAddress: { addressCity: 'Tampa', addressState: 'Florida' },
        lead: { id: 'lead-1', address: { addressState: ' tx ' } },
      },
    ];

    await flattenRelationSubFieldExportValues({
      records,
      plan: {
        cells: [
          {
            kind: 'value',
            key: 'lead__address',
            relationFieldName: 'lead',
            fieldName: 'address',
            isAddress: true,
          },
        ],
        addressFieldNames: ['mailingAddress'],
      },
      workspaceOrmManager: buildWorkspaceOrmManager().asWorkspaceOrmManager,
      authContext,
    });

    expect(records[0].mailingAddress).toEqual({
      addressCity: 'Tampa',
      addressState: 'FL',
    });
    expect(records[0].lead__address).toEqual({ addressState: 'TX' });
    expect(records[0].lead.address).toEqual({ addressState: ' tx ' });
  });
});
