import { type ObjectRecordEvent } from 'twenty-shared/database-events';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type PermissionsMetadataMaps } from 'src/engine/permissions/internal/combine/types/row-access-policy.type';
import { type PermissionsPrincipalsWithRolesContext } from 'src/engine/permissions/principal/types/permissions-principals-with-roles-context.type';
import { filterReconciliationAttachmentEvents } from 'src/modules/reconciliation/utils/filter-reconciliation-attachment-events.util';

jest.mock(
  'src/engine/permissions/internal/role/utils/get-permissions-principals-records-permissions.util',
  () => ({
    getPermissionsPrincipalsRecordsPermissions: jest.fn(() => ({
      objects: mockReaderObjectsPermissions,
    })),
  }),
);

const ATTACHMENT_OBJECT_ID = 'attachment-object-id';
const RECONCILIATION_OBJECT_ID = 'reconciliation-object-id';
const PERSON_OBJECT_ID = 'person-object-id';

const READ_ALL = {
  canCreateAllRecords: false,
  canReadAllRecords: true,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const NO_ACCESS = { ...READ_ALL, canReadAllRecords: false };

let mockReaderObjectsPermissions: Record<string, typeof READ_ALL> = {};

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const buildAttachmentTargetField = (
  name: string,
  relationTargetObjectMetadataId: string,
) =>
  getFlatFieldMetadataMock({
    id: `${name}-field-id`,
    universalIdentifier: `${name}-field-id`,
    objectMetadataId: ATTACHMENT_OBJECT_ID,
    type: FieldMetadataType.MORPH_RELATION,
    name,
    morphId: 'attachment-targets-morph-id',
    relationTargetObjectMetadataId,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: `${name}Id`,
    },
  });

const METADATA_MAPS = {
  flatObjectMetadataMaps: buildFlatEntityMaps([
    getFlatObjectMetadataMock({
      id: ATTACHMENT_OBJECT_ID,
      universalIdentifier: STANDARD_OBJECTS.attachment.universalIdentifier,
      nameSingular: 'attachment',
      namePlural: 'attachments',
      fieldIds: ['targetReconciliation-field-id', 'targetPerson-field-id'],
    }),
    getFlatObjectMetadataMock({
      id: RECONCILIATION_OBJECT_ID,
      universalIdentifier: 'reconciliation-object-universal-identifier',
      nameSingular: 'reconciliation',
      namePlural: 'reconciliations',
    }),
    getFlatObjectMetadataMock({
      id: PERSON_OBJECT_ID,
      universalIdentifier: 'person-object-universal-identifier',
      nameSingular: 'person',
      namePlural: 'people',
    }),
  ]),
  flatFieldMetadataMaps: buildFlatEntityMaps([
    buildAttachmentTargetField(
      'targetReconciliation',
      RECONCILIATION_OBJECT_ID,
    ),
    buildAttachmentTargetField('targetPerson', PERSON_OBJECT_ID),
  ]),
  featureFlagsMap: {},
  rolesPermissions: {},
} as PermissionsMetadataMaps;

const PRINCIPALS = {} as PermissionsPrincipalsWithRolesContext;

const SOURCE_FILE_CREATED_EVENT = {
  recordId: 'source-file-attachment-id',
  properties: {
    after: {
      id: 'source-file-attachment-id',
      name: 'book-of-business.xlsx',
      targetReconciliationId: 'reconciliation-id',
      targetPersonId: null,
    },
  },
} as unknown as ObjectRecordEvent;

const SOURCE_FILE_DETACHED_EVENT = {
  recordId: 'source-file-attachment-id',
  properties: {
    before: {
      id: 'source-file-attachment-id',
      name: 'book-of-business.xlsx',
      targetReconciliationId: 'reconciliation-id',
    },
    after: {
      id: 'source-file-attachment-id',
      name: 'book-of-business.xlsx',
      targetReconciliationId: null,
    },
  },
} as unknown as ObjectRecordEvent;

const PERSON_FILE_CREATED_EVENT = {
  recordId: 'person-attachment-id',
  properties: {
    after: {
      id: 'person-attachment-id',
      name: 'id-card.pdf',
      targetReconciliationId: null,
      targetPersonId: 'person-id',
    },
  },
} as unknown as ObjectRecordEvent;

const filterAttachmentEvents = (events: ObjectRecordEvent[]) =>
  filterReconciliationAttachmentEvents({
    events,
    objectMetadata: {
      universalIdentifier: STANDARD_OBJECTS.attachment.universalIdentifier,
    },
    principals: PRINCIPALS,
    metadataMaps: METADATA_MAPS,
  });

describe('filterReconciliationAttachmentEvents', () => {
  beforeEach(() => {
    mockReaderObjectsPermissions = {
      [ATTACHMENT_OBJECT_ID]: READ_ALL,
      [PERSON_OBJECT_ID]: READ_ALL,
      [RECONCILIATION_OBJECT_ID]: NO_ACCESS,
    };
  });

  it('drops a source file event for a reader who cannot read reconciliations', () => {
    expect(
      filterAttachmentEvents([
        SOURCE_FILE_CREATED_EVENT,
        PERSON_FILE_CREATED_EVENT,
      ]),
    ).toEqual([PERSON_FILE_CREATED_EVENT]);
  });

  it('drops an update whose previous snapshot pointed at a reconciliation', () => {
    expect(filterAttachmentEvents([SOURCE_FILE_DETACHED_EVENT])).toEqual([]);
  });

  it('keeps every event for a reader of the reconciliation objects', () => {
    mockReaderObjectsPermissions[RECONCILIATION_OBJECT_ID] = READ_ALL;

    expect(
      filterAttachmentEvents([
        SOURCE_FILE_CREATED_EVENT,
        PERSON_FILE_CREATED_EVENT,
      ]),
    ).toEqual([SOURCE_FILE_CREATED_EVENT, PERSON_FILE_CREATED_EVENT]);
  });

  it('leaves the events of other objects alone', () => {
    expect(
      filterReconciliationAttachmentEvents({
        events: [SOURCE_FILE_CREATED_EVENT],
        objectMetadata: { universalIdentifier: 'note-universal-identifier' },
        principals: PRINCIPALS,
        metadataMaps: METADATA_MAPS,
      }),
    ).toEqual([SOURCE_FILE_CREATED_EVENT]);
  });
});
