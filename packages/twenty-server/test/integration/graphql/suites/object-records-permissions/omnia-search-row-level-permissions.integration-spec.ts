import { randomUUID } from 'node:crypto';

import { createManyOperation } from 'test/integration/graphql/utils/create-many-operation.util';
import { destroyManyOperationFactory } from 'test/integration/graphql/utils/destroy-many-operation-factory.util';
import { makeGraphqlApiRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { searchFactory } from 'test/integration/graphql/utils/search-factory.util';
import {
  type RowLevelPermissionRuleGrants,
  upsertContainsRlsPredicate,
} from 'test/integration/graphql/utils/upsert-contains-rls-predicate.util';
import { createOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/create-one-field-metadata.util';
import { upsertFieldPermissions } from 'test/integration/metadata/suites/field-permission/utils/upsert-field-permissions.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { deleteOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/delete-one-object-metadata.util';
import { updateOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/update-one-object-metadata.util';
import { revokeObjectRecordsPermissions } from 'test/integration/metadata/suites/object-permission/utils/revoke-object-records-permissions.util';
import { createOneRole } from 'test/integration/metadata/suites/role/utils/create-one-role.util';
import { deleteOneRole } from 'test/integration/metadata/suites/role/utils/delete-one-role.util';
import { findOneRoleByLabel } from 'test/integration/metadata/suites/role/utils/find-one-role-by-label.util';
import { updateWorkspaceMemberRole } from 'test/integration/metadata/suites/role/utils/update-workspace-member-role.util';
import { findObjectMetadataIdByName } from 'test/integration/utils/find-object-metadata-id-by-name.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type SearchRecordDTO } from 'src/engine/core-modules/search/dtos/search-record.dto';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

// Object names must stay camelCase, and lodash camelCase splits words at digits
const RUN_SUFFIX = randomUUID()
  .replace(/-/g, '')
  .slice(0, 8)
  .replace(/\d/g, (digit) => String.fromCharCode(103 + Number(digit)));

const SEARCH_TOKEN = `Zelvorn${RUN_SUFFIX}`;
const VISIBLE_JOB_TITLE = `Visible${RUN_SUFFIX}`;

const PROBE_OBJECT_NAME_SINGULAR = `omniaSearchProbe${RUN_SUFFIX}`;
const PROBE_OBJECT_NAME_PLURAL = `omniaSearchProbes${RUN_SUFFIX}`;
const RESTRICTED_FIELD_NAME = 'probeCode';

const VISIBLE_LEAD_ID = randomUUID();
const HIDDEN_LEAD_ID = randomUUID();
const UNREADABLE_COMPANY_ID = randomUUID();
const PROBE_RECORD_ID = randomUUID();
const LONG_PROBE_RECORD_ID = randomUUID();
const FRAGMENT_PROBE_RECORD_ID = randomUUID();

// Mid-number, so prefix full-text search misses it and only the substring fallback finds
// the leads; no seeded phone number contains it
const PHONE_FRAGMENT = '7304851';

// 120 tokens put positions 1-120 in the vector's text form, which contains "110"
const LONG_PROBE_NAME = Array.from({ length: 120 }, () => 'Filler').join(' ');
const FRAGMENT_PROBE_NAME = 'Ref Q110Z';
const POSITION_FRAGMENT = '110';

const LEAD_RULE_GRANTS = {
  canReadRecords: true,
  canCreateRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
} satisfies Required<RowLevelPermissionRuleGrants>;

type SearchResult = Pick<
  SearchRecordDTO,
  'objectNameSingular' | 'recordId' | 'label'
>;

const VISIBLE_LEAD_RESULT: SearchResult = {
  objectNameSingular: 'person',
  recordId: VISIBLE_LEAD_ID,
  label: `Visible ${SEARCH_TOKEN}`,
};

const HIDDEN_LEAD_RESULT: SearchResult = {
  objectNameSingular: 'person',
  recordId: HIDDEN_LEAD_ID,
  label: `Hidden ${SEARCH_TOKEN}`,
};

const UNREADABLE_COMPANY_RESULT: SearchResult = {
  objectNameSingular: 'company',
  recordId: UNREADABLE_COMPANY_ID,
  label: `${SEARCH_TOKEN} Company`,
};

const PROBE_RESULT: SearchResult = {
  objectNameSingular: PROBE_OBJECT_NAME_SINGULAR,
  recordId: PROBE_RECORD_ID,
  label: `${SEARCH_TOKEN} Probe`,
};

const FRAGMENT_PROBE_RESULT: SearchResult = {
  objectNameSingular: PROBE_OBJECT_NAME_SINGULAR,
  recordId: FRAGMENT_PROBE_RECORD_ID,
  label: FRAGMENT_PROBE_NAME,
};

const sortByRecordId = (results: SearchResult[]): SearchResult[] =>
  [...results].sort((left, right) =>
    left.recordId.localeCompare(right.recordId),
  );

const searchRecords = async ({
  token,
  searchInput = SEARCH_TOKEN,
  includedObjectNameSingulars,
}: {
  token: string;
  searchInput?: string;
  includedObjectNameSingulars: string[];
}): Promise<SearchResult[]> => {
  const response = await makeGraphqlApiRequest(
    searchFactory({
      searchInput,
      includedObjectNameSingulars,
      limit: 50,
    }),
    token,
  );

  expect(response.status).toBe(200);
  expect(response.body.errors).toBeUndefined();

  return sortByRecordId(
    response.body.data.search.edges.map(({ node }: { node: SearchResult }) => ({
      objectNameSingular: node.objectNameSingular,
      recordId: node.recordId,
      label: node.label,
    })),
  );
};

describe('Global search for a member whose role restricts records', () => {
  let originalMemberRoleId: string | undefined;
  let restrictedRoleId: string | undefined;
  let probeObjectMetadataId: string | undefined;

  beforeAll(async () => {
    const { data: probeObjectData } = await createOneObjectMetadata({
      expectToFail: false,
      input: {
        nameSingular: PROBE_OBJECT_NAME_SINGULAR,
        namePlural: PROBE_OBJECT_NAME_PLURAL,
        labelSingular: `Omnia Search Probe ${RUN_SUFFIX}`,
        labelPlural: `Omnia Search Probes ${RUN_SUFFIX}`,
        icon: 'IconSearch',
        isLabelSyncedWithName: false,
      },
    });

    const objectMetadataId = probeObjectData?.createOneObject?.id;

    jestExpectToBeDefined(objectMetadataId);
    probeObjectMetadataId = objectMetadataId;

    const { data: restrictedFieldData } = await createOneFieldMetadata({
      expectToFail: false,
      input: {
        name: RESTRICTED_FIELD_NAME,
        label: 'Probe Code',
        type: FieldMetadataType.TEXT,
        objectMetadataId,
        isLabelSyncedWithName: false,
        isSearchable: true,
      },
    });

    const restrictedFieldMetadataId = restrictedFieldData?.createOneField?.id;

    jestExpectToBeDefined(restrictedFieldMetadataId);

    originalMemberRoleId = (await findOneRoleByLabel({ label: 'Member' })).id;

    const { data: roleData } = await createOneRole({
      expectToFail: false,
      input: {
        label: `Omnia search restricted ${RUN_SUFFIX}`,
        description: 'Reads leads through one row-level rule only',
        icon: 'IconSettings',
        canUpdateAllSettings: false,
        canAccessAllTools: false,
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: true,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: false,
      },
    });

    const roleId = roleData?.createOneRole?.id;

    jestExpectToBeDefined(roleId);
    restrictedRoleId = roleId;

    // Also turns off person's object-level grants, which would otherwise bypass the rule
    await upsertContainsRlsPredicate({
      roleId,
      objectNameSingular: 'person',
      fieldName: 'jobTitle',
      value: VISIBLE_JOB_TITLE,
      ruleGrants: LEAD_RULE_GRANTS,
    });

    await revokeObjectRecordsPermissions({
      roleId,
      objectMetadataId: await findObjectMetadataIdByName('company'),
    });

    await upsertFieldPermissions({
      expectToFail: false,
      input: {
        roleId,
        fieldPermissions: [
          {
            objectMetadataId,
            fieldMetadataId: restrictedFieldMetadataId,
            canReadFieldValue: false,
            canUpdateFieldValue: false,
          },
        ],
      },
    });

    await createManyOperation({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      expectToFail: false,
      data: [
        {
          id: VISIBLE_LEAD_ID,
          name: { firstName: 'Visible', lastName: SEARCH_TOKEN },
          jobTitle: VISIBLE_JOB_TITLE,
          phones: {
            primaryPhoneNumber: `256${PHONE_FRAGMENT}`,
            primaryPhoneCallingCode: '+1',
          },
        },
        {
          id: HIDDEN_LEAD_ID,
          name: { firstName: 'Hidden', lastName: SEARCH_TOKEN },
          jobTitle: 'Outside the rule',
          phones: {
            primaryPhoneNumber: `310${PHONE_FRAGMENT}`,
            primaryPhoneCallingCode: '+1',
          },
        },
      ],
    });

    await createManyOperation({
      objectMetadataSingularName: 'company',
      objectMetadataPluralName: 'companies',
      expectToFail: false,
      data: [{ id: UNREADABLE_COMPANY_ID, name: `${SEARCH_TOKEN} Company` }],
    });

    await createManyOperation({
      objectMetadataSingularName: PROBE_OBJECT_NAME_SINGULAR,
      objectMetadataPluralName: PROBE_OBJECT_NAME_PLURAL,
      expectToFail: false,
      data: [
        {
          id: PROBE_RECORD_ID,
          name: `${SEARCH_TOKEN} Probe`,
          [RESTRICTED_FIELD_NAME]: `Restricted ${RUN_SUFFIX}`,
        },
        { id: LONG_PROBE_RECORD_ID, name: LONG_PROBE_NAME },
        { id: FRAGMENT_PROBE_RECORD_ID, name: FRAGMENT_PROBE_NAME },
      ],
    });

    await updateWorkspaceMemberRole({
      expectToFail: false,
      input: {
        roleId,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
      },
    });
  });

  afterAll(async () => {
    if (isDefined(originalMemberRoleId)) {
      await updateWorkspaceMemberRole({
        expectToFail: false,
        input: {
          roleId: originalMemberRoleId,
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        },
      });
    }

    // Deleting the role also deletes its rule and its object and field permissions
    if (isDefined(restrictedRoleId)) {
      await deleteOneRole({
        expectToFail: false,
        input: { idToDelete: restrictedRoleId },
      });
    }

    for (const [singular, plural, ids] of [
      ['person', 'people', [VISIBLE_LEAD_ID, HIDDEN_LEAD_ID]],
      ['company', 'companies', [UNREADABLE_COMPANY_ID]],
    ] as const) {
      await makeGraphqlApiRequest(
        destroyManyOperationFactory({
          objectMetadataSingularName: singular,
          objectMetadataPluralName: plural,
          gqlFields: 'id',
          filter: { id: { in: [...ids] } },
        }),
      );
    }

    // Deleting the object also drops its records
    if (isDefined(probeObjectMetadataId)) {
      await updateOneObjectMetadata({
        expectToFail: false,
        input: {
          idToUpdate: probeObjectMetadataId,
          updatePayload: { isActive: false },
        },
      });
      await deleteOneObjectMetadata({
        expectToFail: false,
        input: { idToDelete: probeObjectMetadataId },
      });
    }
  });

  it('should leave out a lead outside the row-level rule and return the lead inside it', async () => {
    expect(
      await searchRecords({
        token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
        includedObjectNameSingulars: ['person'],
      }),
    ).toEqual([VISIBLE_LEAD_RESULT]);
    expect(
      await searchRecords({
        token: APPLE_JANE_ADMIN_ACCESS_TOKEN,
        includedObjectNameSingulars: ['person'],
      }),
    ).toEqual(sortByRecordId([VISIBLE_LEAD_RESULT, HIDDEN_LEAD_RESULT]));
  });

  it('should skip an object the role cannot read and still return the readable one', async () => {
    expect(
      await searchRecords({
        token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
        includedObjectNameSingulars: ['company', 'person'],
      }),
    ).toEqual([VISIBLE_LEAD_RESULT]);
    expect(
      await searchRecords({
        token: APPLE_JANE_ADMIN_ACCESS_TOKEN,
        includedObjectNameSingulars: ['company', 'person'],
      }),
    ).toEqual(
      sortByRecordId([
        VISIBLE_LEAD_RESULT,
        HIDDEN_LEAD_RESULT,
        UNREADABLE_COMPANY_RESULT,
      ]),
    );
  });

  it('should still return a custom object when the role cannot read one of its searchable fields', async () => {
    expect(
      await searchRecords({
        token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
        includedObjectNameSingulars: [PROBE_OBJECT_NAME_SINGULAR],
      }),
    ).toEqual([PROBE_RESULT]);
  });

  it('should apply the row-level rule when a phone fragment falls back to substring matching', async () => {
    expect(
      await searchRecords({
        token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
        searchInput: PHONE_FRAGMENT,
        includedObjectNameSingulars: ['person'],
      }),
    ).toEqual([VISIBLE_LEAD_RESULT]);

    // Leads left by an interrupted earlier run would also match; assert this run's only
    const runLeadIds = new Set<string>([VISIBLE_LEAD_ID, HIDDEN_LEAD_ID]);
    const adminResults = await searchRecords({
      token: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      searchInput: PHONE_FRAGMENT,
      includedObjectNameSingulars: ['person'],
    });

    expect(
      adminResults.filter(({ recordId }) => runLeadIds.has(recordId)),
    ).toEqual(sortByRecordId([VISIBLE_LEAD_RESULT, HIDDEN_LEAD_RESULT]));
  });

  it('should match a digit fragment against indexed words, not tsvector positions', async () => {
    expect(
      await searchRecords({
        token: APPLE_JANE_ADMIN_ACCESS_TOKEN,
        searchInput: POSITION_FRAGMENT,
        includedObjectNameSingulars: [PROBE_OBJECT_NAME_SINGULAR],
      }),
    ).toEqual([FRAGMENT_PROBE_RESULT]);
  });
});
