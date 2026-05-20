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
});
