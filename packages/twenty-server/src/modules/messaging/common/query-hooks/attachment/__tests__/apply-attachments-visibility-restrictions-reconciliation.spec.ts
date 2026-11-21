import { Test } from '@nestjs/testing';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { CommonRecordVisibilityService } from 'src/engine/api/common/common-record-visibility/common-record-visibility.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { ApplyAttachmentsVisibilityRestrictionsService } from 'src/modules/messaging/common/query-hooks/attachment/apply-attachments-visibility-restrictions.service';
import { ApplyMessagesVisibilityRestrictionsService } from 'src/modules/messaging/common/query-hooks/message/apply-messages-visibility-restrictions.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const ATTACHMENT_OBJECT_ID = 'attachment-object-id';
const RECONCILIATION_OBJECT_ID = 'reconciliation-object-id';
const PERSON_OBJECT_ID = 'person-object-id';
const TARGET_RECONCILIATION_FIELD_ID = 'target-reconciliation-field-id';
const TARGET_PERSON_FIELD_ID = 'target-person-field-id';
const SOURCE_FILE_ATTACHMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSON_ATTACHMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
} as WorkspaceAuthContext;

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

const RESTRICTED_SOURCE_FILE_ATTACHMENT = {
  id: SOURCE_FILE_ATTACHMENT_ID,
  name: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
  fullPath: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
  file: [],
};

// The reconciliation lookup passes a list of conditions; the message lookup passes one
const find = jest.fn(async ({ where }: { where: unknown }) =>
  Array.isArray(where) ? [{ id: SOURCE_FILE_ATTACHMENT_ID }] : [],
);

const setup = async ({
  hasTargetMessageField,
}: {
  hasTargetMessageField: boolean;
}) => {
  const module = await Test.createTestingModule({
    providers: [
      ApplyAttachmentsVisibilityRestrictionsService,
      {
        provide: WorkspaceOrmManager,
        useValue: {
          executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
            callback(),
          ),
          getRepositoryWithoutPermissionChecks: jest.fn(() => ({ find })),
        },
      },
      {
        provide: CommonRecordVisibilityService,
        useValue: { registerHandler: jest.fn() },
      },
      {
        provide: ApplyMessagesVisibilityRestrictionsService,
        useValue: { findVisibleMessageIds: jest.fn() },
      },
      {
        provide: WorkspaceCacheService,
        useValue: {
          getOrRecompute: jest.fn().mockResolvedValue({
            flatFieldMetadataMaps: {
              byUniversalIdentifier: hasTargetMessageField
                ? {
                    [STANDARD_OBJECTS.attachment.fields.targetMessage
                      .universalIdentifier]: {},
                  }
                : {},
            },
          }),
        },
      },
    ],
  }).compile();

  const service = module.get(ApplyAttachmentsVisibilityRestrictionsService);

  return ({
    attachments,
    unreadableObjectMetadataIds,
  }: {
    attachments: ReturnType<typeof buildAttachments>;
    unreadableObjectMetadataIds: string[];
  }) =>
    service.applyVisibilityRestrictions({
      records: attachments,
      authContext: AUTH_CONTEXT,
      recordReadRestrictions: {
        unreadableObjectMetadataIds: new Set(unreadableObjectMetadataIds),
        unreadableFieldMetadataIds: new Set(),
      },
      flatObjectMetadataMaps: FLAT_OBJECT_METADATA_MAPS,
      flatFieldMetadataMaps: FLAT_FIELD_METADATA_MAPS,
    });
};

describe('ApplyAttachmentsVisibilityRestrictionsService reconciliation source files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blanks a reconciliation source file for a reader who cannot read reconciliations', async () => {
    const applyVisibilityRestrictions = await setup({
      hasTargetMessageField: true,
    });
    const attachments = buildAttachments();

    await applyVisibilityRestrictions({
      attachments,
      unreadableObjectMetadataIds: [RECONCILIATION_OBJECT_ID],
    });

    expect(attachments).toEqual([
      RESTRICTED_SOURCE_FILE_ATTACHMENT,
      buildAttachments()[1],
    ]);
  });

  it('blanks it before the message check, which skips workspaces the upgrade has not reached', async () => {
    const applyVisibilityRestrictions = await setup({
      hasTargetMessageField: false,
    });
    const attachments = buildAttachments();

    await applyVisibilityRestrictions({
      attachments,
      unreadableObjectMetadataIds: [RECONCILIATION_OBJECT_ID],
    });

    expect(attachments).toEqual([
      RESTRICTED_SOURCE_FILE_ATTACHMENT,
      buildAttachments()[1],
    ]);
  });

  it('leaves every attachment to a reader of the reconciliation objects', async () => {
    const applyVisibilityRestrictions = await setup({
      hasTargetMessageField: true,
    });
    const attachments = buildAttachments();

    await applyVisibilityRestrictions({
      attachments,
      unreadableObjectMetadataIds: [],
    });

    expect(attachments).toEqual(buildAttachments());
    expect(find).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Array) }),
    );
  });
});
