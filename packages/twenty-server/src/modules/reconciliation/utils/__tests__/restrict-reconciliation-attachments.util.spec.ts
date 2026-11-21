import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { In, IsNull, Not } from 'typeorm';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { restrictReconciliationAttachments } from 'src/modules/reconciliation/utils/restrict-reconciliation-attachments.util';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const ATTACHMENT_OBJECT_ID = 'attachment-object-id';
const RECONCILIATION_OBJECT_ID = 'reconciliation-object-id';
const PERSON_OBJECT_ID = 'person-object-id';
const TARGET_RECONCILIATION_FIELD_ID = 'target-reconciliation-field-id';
const TARGET_PERSON_FIELD_ID = 'target-person-field-id';
const SOURCE_FILE_ATTACHMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSON_ATTACHMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const FLAT_OBJECT_METADATA_MAPS = buildFlatEntityMaps([
  getFlatObjectMetadataMock({
    id: ATTACHMENT_OBJECT_ID,
    universalIdentifier: STANDARD_OBJECTS.attachment.universalIdentifier,
    nameSingular: 'attachment',
    namePlural: 'attachments',
    fieldIds: [TARGET_RECONCILIATION_FIELD_ID, TARGET_PERSON_FIELD_ID],
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
]);

const buildAttachmentTargetField = ({
  id,
  name,
  relationTargetObjectMetadataId,
}: {
  id: string;
  name: string;
  relationTargetObjectMetadataId: string;
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
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

const FLAT_FIELD_METADATA_MAPS = buildFlatEntityMaps([
  buildAttachmentTargetField({
    id: TARGET_RECONCILIATION_FIELD_ID,
    name: 'targetReconciliation',
    relationTargetObjectMetadataId: RECONCILIATION_OBJECT_ID,
  }),
  buildAttachmentTargetField({
    id: TARGET_PERSON_FIELD_ID,
    name: 'targetPerson',
    relationTargetObjectMetadataId: PERSON_OBJECT_ID,
  }),
]);

const buildAttachments = () => [
  {
    id: SOURCE_FILE_ATTACHMENT_ID,
    name: 'book-of-business.xlsx',
    fullPath: 'attachment/book-of-business.xlsx',
    file: [{ fileId: 'source-file-id', label: 'book-of-business.xlsx' }],
  },
  {
    id: PERSON_ATTACHMENT_ID,
    name: 'id-card.pdf',
    file: [{ fileId: 'person-file-id', label: 'id-card.pdf' }],
  },
];

describe('restrictReconciliationAttachments', () => {
  const find = jest.fn();
  const getRepositoryWithoutPermissionChecks = jest.fn(() => ({ find }));
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepositoryWithoutPermissionChecks,
  } as unknown as WorkspaceOrmManager;

  beforeEach(() => {
    jest.clearAllMocks();
    find.mockResolvedValue([{ id: SOURCE_FILE_ATTACHMENT_ID }]);
  });

  const restrict = ({
    attachments,
    unreadableObjectMetadataIds,
  }: {
    attachments: ReturnType<typeof buildAttachments>;
    unreadableObjectMetadataIds: string[];
  }) =>
    restrictReconciliationAttachments({
      attachments,
      recordReadRestrictions: {
        unreadableObjectMetadataIds: new Set(unreadableObjectMetadataIds),
        unreadableFieldMetadataIds: new Set(),
      },
      flatObjectMetadataMaps: FLAT_OBJECT_METADATA_MAPS,
      flatFieldMetadataMaps: FLAT_FIELD_METADATA_MAPS,
      workspaceId: WORKSPACE_ID,
      workspaceOrmManager,
    });

  it('hides a reconciliation source file from a reader who cannot read reconciliations', async () => {
    const attachments = buildAttachments();

    await restrict({
      attachments,
      unreadableObjectMetadataIds: [RECONCILIATION_OBJECT_ID],
    });

    expect(attachments).toEqual([
      {
        id: SOURCE_FILE_ATTACHMENT_ID,
        name: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        fullPath: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        file: [],
      },
      buildAttachments()[1],
    ]);
    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith(
      'attachment',
    );
    expect(find).toHaveBeenCalledWith({
      where: [
        {
          id: In([SOURCE_FILE_ATTACHMENT_ID, PERSON_ATTACHMENT_ID]),
          targetReconciliationId: Not(IsNull()),
        },
      ],
      select: ['id'],
      withDeleted: true,
    });
  });

  it('leaves every attachment to a reader of the reconciliation objects', async () => {
    const attachments = buildAttachments();

    await restrict({ attachments, unreadableObjectMetadataIds: [] });

    expect(attachments).toEqual(buildAttachments());
    expect(find).not.toHaveBeenCalled();
  });

  it('looks nothing up when only objects other than the reconciliation ones are unreadable', async () => {
    const attachments = buildAttachments();

    await restrict({
      attachments,
      unreadableObjectMetadataIds: [PERSON_OBJECT_ID],
    });

    expect(attachments).toEqual(buildAttachments());
    expect(find).not.toHaveBeenCalled();
  });
});
