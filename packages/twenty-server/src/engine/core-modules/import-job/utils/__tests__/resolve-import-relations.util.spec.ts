import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { resolveImportRelations } from 'src/engine/core-modules/import-job/utils/resolve-import-relations.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/permissions/permissions.exception';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';

type QueryBuilderOptions = {
  manyRecords?: Record<string, unknown>[];
  phoneIndexRecords?: Record<string, unknown>[];
  emailIndexRecords?: Record<string, unknown>[];
  indexQueryError?: Error;
};

type MockQueryBuilder = {
  select: jest.MockedFunction<(columns: string[]) => MockQueryBuilder>;
  where: jest.MockedFunction<() => MockQueryBuilder>;
  andWhere: jest.MockedFunction<() => MockQueryBuilder>;
  limit: jest.MockedFunction<() => MockQueryBuilder>;
  getMany: jest.MockedFunction<() => Promise<Record<string, unknown>[]>>;
};

// The phone and email indexes select explicit columns; every other query reads whole records
const makeRepository = ({
  manyRecords = [],
  phoneIndexRecords = [],
  emailIndexRecords = [],
  indexQueryError,
}: QueryBuilderOptions): WorkspaceRepository<ObjectRecord> => {
  const createQueryBuilder = jest.fn(() => {
    let selectedColumns: string[] = [];

    const queryBuilder: MockQueryBuilder = {
      select: jest.fn((columns: string[]) => {
        selectedColumns = columns;

        return queryBuilder;
      }),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      limit: jest.fn(() => queryBuilder),
      getMany: jest.fn(async () => {
        if (selectedColumns.length === 0) {
          return manyRecords;
        }

        if (isDefined(indexQueryError)) {
          throw indexQueryError;
        }

        return selectedColumns.includes('phonesPrimaryPhoneNumber')
          ? phoneIndexRecords
          : emailIndexRecords;
      }),
    };

    return queryBuilder;
  });

  return { createQueryBuilder } as unknown as WorkspaceRepository<ObjectRecord>;
};

const objectMaps = {
  byUniversalIdentifier: {
    policy: {
      id: 'policy-object-id',
      nameSingular: 'policy',
    },
    person: {
      id: 'person-object-id',
      nameSingular: 'person',
    },
  },
} as unknown as FlatEntityMaps<FlatObjectMetadata>;

const fieldMaps = {
  byUniversalIdentifier: {
    lead: {
      id: 'lead-field-id',
      objectMetadataId: 'policy-object-id',
      name: 'lead',
      relationTargetObjectMetadataId: 'person-object-id',
      settings: {
        joinColumnName: 'leadId',
      },
    },
  },
} as unknown as FlatEntityMaps<FlatFieldMetadata>;

describe('resolveImportRelations', () => {
  const commissionCarrierId = '11111111-1111-4111-8111-111111111111';
  const commissionPolicyId = '22222222-2222-4222-8222-222222222222';
  const commissionLeadId = '33333333-3333-4333-8333-333333333333';

  it('updates an existing matched related record when the main record has no current relation', async () => {
    const mainRepository = makeRepository({
      manyRecords: [
        {
          id: 'policy-1',
          leadId: null,
        },
      ],
    });

    const personRepository = makeRepository({
      manyRecords: [
        {
          id: 'person-1',
          name: { firstName: 'Jordan', lastName: 'Testlead' },
          phones: { primaryPhoneNumber: '2025550187' },
          emails: { primaryEmail: 'jordan.testlead@example.com' },
          addressCustom: {},
          dateOfBirth: null,
        },
      ],
      phoneIndexRecords: [
        {
          id: 'person-1',
          phonesPrimaryPhoneNumber: '2025550187',
        },
      ],
      emailIndexRecords: [
        {
          id: 'person-1',
          emailsPrimaryEmail: 'jordan.testlead@example.com',
        },
      ],
    });

    const plan = await resolveImportRelations(
      [
        {
          id: 'policy-1',
          'lead.name.firstName': 'Jordan',
          'lead.name.lastName': 'Testlead',
          'lead.dateOfBirth': '1980-01-01',
          'lead.phones.primaryPhoneNumber': '2025550187',
          'lead.emails.primaryEmail': 'jordan.testlead@example.com',
          'lead.addressCustom.addressStreet1': '100 SAMPLE ST',
          'lead.addressCustom.addressCity': 'TESTVILLE',
          'lead.addressCustom.addressState': 'TX',
          'lead.addressCustom.addressPostcode': '12345',
        },
      ],
      [
        {
          relationFieldName: 'lead',
          behavior: 'SMART_UPDATE',
          onNotFound: 'CREATE',
          uniqueConstraintFields: ['phones'],
        },
      ],
      'policy',
      objectMaps,
      fieldMaps,
      async (objectName) =>
        objectName === 'policy' ? mainRepository : personRepository,
    );

    expect(plan.errors).toEqual([]);
    expect(plan.reassignments).toEqual([
      {
        mainRecordId: 'policy-1',
        joinColumnName: 'leadId',
        newRelatedRecordId: 'person-1',
      },
    ]);
    expect(plan.relatedRecordUpdates).toEqual([
      {
        recordId: 'person-1',
        objectNameSingular: 'person',
        fields: {
          dateOfBirth: '1980-01-01',
          addressCustom: {
            addressStreet1: '100 SAMPLE ST',
            addressCity: 'TESTVILLE',
            addressState: 'TX',
            addressPostcode: '12345',
          },
        },
        sourceRowIndices: [0],
      },
    ]);
    expect(plan.processedRows).toEqual([
      {
        id: 'policy-1',
        leadId: 'person-1',
      },
    ]);
  });

  it('assigns a lookup relation by UUID label on a new main record', async () => {
    const mainRepository = makeRepository({});
    const carrierRepository = makeRepository({
      manyRecords: [
        {
          id: commissionCarrierId,
          name: 'Ambetter',
        },
      ],
    });

    const commissionObjectMaps = {
      byUniversalIdentifier: {
        commission: {
          id: 'commission-object-id',
          nameSingular: 'commission',
        },
        carrier: {
          id: 'carrier-object-id',
          nameSingular: 'carrier',
        },
      },
    } as unknown as FlatEntityMaps<FlatObjectMetadata>;

    const commissionFieldMaps = {
      byUniversalIdentifier: {
        carrier: {
          id: 'carrier-field-id',
          objectMetadataId: 'commission-object-id',
          name: 'carrier',
          relationTargetObjectMetadataId: 'carrier-object-id',
          settings: {
            joinColumnName: 'carrierId',
          },
        },
      },
    } as unknown as FlatEntityMaps<FlatFieldMetadata>;

    const plan = await resolveImportRelations(
      [
        {
          carrier: commissionCarrierId,
          amountReceived: 123.45,
        },
      ],
      [
        {
          relationFieldName: 'carrier',
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
      ],
      'commission',
      commissionObjectMaps,
      commissionFieldMaps,
      async (objectName) =>
        objectName === 'commission' ? mainRepository : carrierRepository,
    );

    expect(plan.errors).toEqual([]);
    expect(plan.reassignments).toEqual([]);
    expect(plan.processedRows).toEqual([
      {
        amountReceived: 123.45,
        carrierId: commissionCarrierId,
      },
    ]);
  });

  it('assigns lookup and smart-update relations by id sub-field on a new main record', async () => {
    const mainRepository = makeRepository({});
    const policyRepository = makeRepository({
      manyRecords: [
        {
          id: commissionPolicyId,
          name: 'Policy 1',
        },
      ],
    });
    const personRepository = makeRepository({
      manyRecords: [
        {
          id: commissionLeadId,
          name: { firstName: 'Jordan', lastName: 'Testlead' },
          phones: { primaryPhoneNumber: '2025550187' },
          emails: { primaryEmail: 'jordan.testlead@example.com' },
        },
      ],
      phoneIndexRecords: [
        {
          id: commissionLeadId,
          phonesPrimaryPhoneNumber: '2025550187',
        },
      ],
      emailIndexRecords: [
        {
          id: commissionLeadId,
          emailsPrimaryEmail: 'jordan.testlead@example.com',
        },
      ],
    });

    const commissionObjectMaps = {
      byUniversalIdentifier: {
        commission: {
          id: 'commission-object-id',
          nameSingular: 'commission',
        },
        person: {
          id: 'person-object-id',
          nameSingular: 'person',
        },
        policy: {
          id: 'policy-object-id',
          nameSingular: 'policy',
        },
      },
    } as unknown as FlatEntityMaps<FlatObjectMetadata>;

    const commissionFieldMaps = {
      byUniversalIdentifier: {
        lead: {
          id: 'lead-field-id',
          objectMetadataId: 'commission-object-id',
          name: 'lead',
          relationTargetObjectMetadataId: 'person-object-id',
          settings: {
            joinColumnName: 'leadId',
          },
        },
        policy: {
          id: 'policy-field-id',
          objectMetadataId: 'commission-object-id',
          name: 'policy',
          relationTargetObjectMetadataId: 'policy-object-id',
          settings: {
            joinColumnName: 'policyId',
          },
        },
      },
    } as unknown as FlatEntityMaps<FlatFieldMetadata>;

    const plan = await resolveImportRelations(
      [
        {
          'lead.id': commissionLeadId,
          'policy.id': commissionPolicyId,
          amountReceived: 123.45,
        },
      ],
      [
        {
          relationFieldName: 'lead',
          behavior: 'SMART_UPDATE',
          onNotFound: 'CREATE',
          uniqueConstraintFields: ['phones'],
        },
        {
          relationFieldName: 'policy',
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
      ],
      'commission',
      commissionObjectMaps,
      commissionFieldMaps,
      async (objectName) => {
        if (objectName === 'commission') {
          return mainRepository;
        }

        if (objectName === 'policy') {
          return policyRepository;
        }

        return personRepository;
      },
    );

    expect(plan.errors).toEqual([]);
    expect(plan.reassignments).toEqual([]);
    expect(plan.relatedRecordUpdates).toEqual([]);
    expect(plan.processedRows).toEqual([
      {
        amountReceived: 123.45,
        leadId: commissionLeadId,
        policyId: commissionPolicyId,
      },
    ]);
  });

  // Updates check edit permission on every column they send, so a requester whose role locks policy.agent
  // could update no policy at all if each row carried the foreign keys the CSV leaves alone
  it('keeps the foreign keys the CSV does not change out of an existing record row', async () => {
    const agentId = '44444444-4444-4444-8444-444444444444';
    const carrierId = '55555555-5555-4555-8555-555555555555';
    const leadId = '66666666-6666-4666-8666-666666666666';
    const mainRepository = makeRepository({
      manyRecords: [{ id: 'policy-1', agentId, carrierId, leadId }],
    });
    const carrierRepository = makeRepository({
      manyRecords: [{ id: carrierId, name: 'Ambetter' }],
    });

    const policyObjectMaps = {
      byUniversalIdentifier: {
        policy: { id: 'policy-object-id', nameSingular: 'policy' },
        agentProfile: {
          id: 'agent-profile-object-id',
          nameSingular: 'agentProfile',
        },
        carrier: { id: 'carrier-object-id', nameSingular: 'carrier' },
        person: { id: 'person-object-id', nameSingular: 'person' },
      },
    } as unknown as FlatEntityMaps<FlatObjectMetadata>;

    const policyFieldMaps = {
      byUniversalIdentifier: {
        agent: {
          id: 'agent-field-id',
          objectMetadataId: 'policy-object-id',
          name: 'agent',
          relationTargetObjectMetadataId: 'agent-profile-object-id',
          settings: { joinColumnName: 'agentId' },
        },
        carrier: {
          id: 'carrier-field-id',
          objectMetadataId: 'policy-object-id',
          name: 'carrier',
          relationTargetObjectMetadataId: 'carrier-object-id',
          settings: { joinColumnName: 'carrierId' },
        },
        lead: {
          id: 'lead-field-id',
          objectMetadataId: 'policy-object-id',
          name: 'lead',
          relationTargetObjectMetadataId: 'person-object-id',
          settings: { joinColumnName: 'leadId' },
        },
      },
    } as unknown as FlatEntityMaps<FlatFieldMetadata>;

    const plan = await resolveImportRelations(
      [{ id: 'policy-1', premium: 120, 'carrier.id': carrierId }],
      [
        {
          relationFieldName: 'agent',
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
        {
          relationFieldName: 'carrier',
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
        {
          relationFieldName: 'lead',
          behavior: 'SMART_UPDATE',
          onNotFound: 'CREATE',
          uniqueConstraintFields: ['phones'],
        },
      ],
      'policy',
      policyObjectMaps,
      policyFieldMaps,
      async (objectName) => {
        if (objectName === 'policy') {
          return mainRepository;
        }

        return objectName === 'carrier'
          ? carrierRepository
          : makeRepository({});
      },
    );

    expect(plan.errors).toEqual([]);
    expect(plan.reassignments).toEqual([]);
    expect(plan.processedRows).toEqual([{ id: 'policy-1', premium: 120 }]);
  });

  it('fails instead of creating a duplicate when the requester cannot read the lookup fields', async () => {
    const mainRepository = makeRepository({});
    const personRepository = makeRepository({
      indexQueryError: new PermissionsException(
        'Permission denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    });

    await expect(
      resolveImportRelations(
        [
          {
            id: 'policy-1',
            'lead.name.firstName': 'Jordan',
            'lead.name.lastName': 'Testlead',
            'lead.phones.primaryPhoneNumber': '2025550187',
          },
        ],
        [
          {
            relationFieldName: 'lead',
            behavior: 'SMART_UPDATE',
            onNotFound: 'CREATE',
            uniqueConstraintFields: ['phones'],
          },
        ],
        'policy',
        objectMaps,
        fieldMaps,
        async (objectName) =>
          objectName === 'policy' ? mainRepository : personRepository,
      ),
    ).rejects.toBeInstanceOf(PermissionsException);
  });
});
