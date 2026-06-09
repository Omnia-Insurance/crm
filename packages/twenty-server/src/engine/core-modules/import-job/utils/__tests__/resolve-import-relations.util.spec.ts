import { type ObjectLiteral, type Repository } from 'typeorm';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

import { resolveImportRelations } from '../resolve-import-relations.util';

type QueryBuilderOptions = {
  manyRecords?: Record<string, unknown>[];
  rawPhoneRecords?: Record<string, unknown>[];
  rawEmailRecords?: Record<string, unknown>[];
};

type MockQueryBuilder = {
  select: jest.MockedFunction<(columns: string[]) => MockQueryBuilder>;
  where: jest.MockedFunction<() => MockQueryBuilder>;
  andWhere: jest.MockedFunction<() => MockQueryBuilder>;
  limit: jest.MockedFunction<() => MockQueryBuilder>;
  getMany: jest.MockedFunction<() => Promise<Record<string, unknown>[]>>;
  getRawMany: jest.MockedFunction<() => Promise<Record<string, unknown>[]>>;
};

const makeRepository = ({
  manyRecords = [],
  rawPhoneRecords = [],
  rawEmailRecords = [],
}: QueryBuilderOptions): Repository<ObjectLiteral> => {
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
      getMany: jest.fn(async () => manyRecords),
      getRawMany: jest.fn(async () =>
        selectedColumns.some((column) =>
          column.includes('phonesPrimaryPhoneNumber'),
        )
          ? rawPhoneRecords
          : rawEmailRecords,
      ),
    };

    return queryBuilder;
  });

  return { createQueryBuilder } as unknown as Repository<ObjectLiteral>;
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
          name: { firstName: 'Thomas', lastName: 'Anderson' },
          phones: { primaryPhoneNumber: '8649325438' },
          emails: { primaryEmail: 'cheetchanderson238@gmail.com' },
          addressCustom: {},
          dateOfBirth: null,
        },
      ],
      rawPhoneRecords: [
        {
          id: 'person-1',
          phonesPrimaryPhoneNumber: '8649325438',
        },
      ],
      rawEmailRecords: [
        {
          id: 'person-1',
          emailsPrimaryEmail: 'cheetchanderson238@gmail.com',
        },
      ],
    });

    const plan = await resolveImportRelations(
      [
        {
          id: 'policy-1',
          'lead.name.firstName': 'Thomas',
          'lead.name.lastName': 'Anderson',
          'lead.dateOfBirth': '1971-12-10',
          'lead.phones.primaryPhoneNumber': '8649325438',
          'lead.emails.primaryEmail': 'cheetchanderson238@gmail.com',
          'lead.addressCustom.addressStreet1': '507 JOHNSON ST',
          'lead.addressCustom.addressCity': 'ANDERSON',
          'lead.addressCustom.addressState': 'SC',
          'lead.addressCustom.addressPostcode': '29624',
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
          dateOfBirth: '1971-12-10',
          addressCustom: {
            addressStreet1: '507 JOHNSON ST',
            addressCity: 'ANDERSON',
            addressState: 'SC',
            addressPostcode: '29624',
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
          name: { firstName: 'Thomas', lastName: 'Anderson' },
          phones: { primaryPhoneNumber: '8649325438' },
          emails: { primaryEmail: 'cheetchanderson238@gmail.com' },
        },
      ],
      rawPhoneRecords: [
        {
          id: commissionLeadId,
          phonesPrimaryPhoneNumber: '8649325438',
        },
      ],
      rawEmailRecords: [
        {
          id: commissionLeadId,
          emailsPrimaryEmail: 'cheetchanderson238@gmail.com',
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
});
