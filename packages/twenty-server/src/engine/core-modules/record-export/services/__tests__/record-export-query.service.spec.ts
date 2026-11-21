import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { formatRecordExportHeader } from 'twenty-shared/utils';

import { type CommonFindManyQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-find-many-query-runner.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { RecordExportQueryService } from 'src/engine/core-modules/record-export/services/record-export-query.service';
import { type RecordExportParameters } from 'src/engine/core-modules/record-export/types/record-export-parameters.type';
import { type ApplicationTranslationCatalogService } from 'src/engine/metadata-modules/application-translation-catalog/services/application-translation-catalog.service';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type EffectiveEntityI18nContext } from 'src/engine/metadata-modules/overrides/types/effective-entity-i18n-context.type';
import { NO_RECORD_READ_RESTRICTIONS } from 'src/engine/permissions/constants/no-record-read-restrictions.constant';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const policyName = getFlatFieldMetadataMock({
  id: 'policy-name',
  universalIdentifier: 'policy-name',
  objectMetadataId: 'policy-object',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.TEXT,
});
const policyLead = getFlatFieldMetadataMock({
  id: 'policy-lead',
  universalIdentifier: 'policy-lead',
  objectMetadataId: 'policy-object',
  name: 'lead',
  label: 'Lead',
  type: FieldMetadataType.RELATION,
  relationTargetObjectMetadataId: 'person-object',
  settings: { relationType: RelationType.MANY_TO_ONE },
});
const personName = getFlatFieldMetadataMock({
  id: 'person-name',
  universalIdentifier: 'person-name',
  objectMetadataId: 'person-object',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.FULL_NAME,
});
const personDateOfBirth = getFlatFieldMetadataMock({
  id: 'person-date-of-birth',
  universalIdentifier: 'person-date-of-birth',
  objectMetadataId: 'person-object',
  name: 'dateOfBirth',
  label: 'Date of Birth',
  type: FieldMetadataType.DATE,
});
const policy = getFlatObjectMetadataMock({
  id: 'policy-object',
  universalIdentifier: 'policy-object',
  nameSingular: 'policy',
  fieldIds: [policyName.id, policyLead.id],
  labelIdentifierFieldMetadataId: policyName.id,
});
const person = getFlatObjectMetadataMock({
  id: 'person-object',
  universalIdentifier: 'person-object',
  nameSingular: 'person',
  fieldIds: [personName.id, personDateOfBirth.id],
  labelIdentifierFieldMetadataId: personName.id,
});
const flatObjectMetadataMaps = [policy, person].reduce<
  FlatEntityMaps<FlatObjectMetadata>
>(
  (flatEntityMaps, flatEntity) =>
    addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
  createEmptyFlatEntityMaps(),
);
const flatFieldMetadataMaps = [
  policyName,
  policyLead,
  personName,
  personDateOfBirth,
].reduce<FlatEntityMaps<FlatFieldMetadata>>(
  (flatEntityMaps, flatEntity) =>
    addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
  createEmptyFlatEntityMaps(),
);

const untranslatedI18nContext: EffectiveEntityI18nContext = {
  locale: undefined,
  i18nInstance: { _: (messageId: string) => messageId },
  isStandardApp: false,
  workspaceCustomApplicationUniversalIdentifier: 'workspace-custom-application',
  ownerApplicationUniversalIdentifier: undefined,
};

const userAuthContext = {
  type: 'user',
  workspace: { id: 'workspace-id' },
  workspaceMember: { locale: 'en' },
} as unknown as WorkspaceAuthContext;

const parameters: RecordExportParameters = {
  objectMetadataId: policy.id,
  fieldMetadataIds: [policyName.id, policyLead.id],
  relationSubFields: [
    { fieldMetadataId: policyLead.id, subFieldName: 'dateOfBirth' },
  ],
};

const buildService = () => {
  const execute = jest.fn().mockResolvedValue({
    results: {
      records: [
        {
          id: 'policy-1',
          name: 'Gold Plan',
          leadId: 'lead-1',
          lead: {
            id: 'lead-1',
            name: { firstName: 'Ann', lastName: 'Lee' },
            dateOfBirth: '1980-02-03',
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  });
  const service = new RecordExportQueryService(
    {
      getOrRecompute: jest
        .fn()
        .mockResolvedValue({ flatObjectMetadataMaps, flatFieldMetadataMaps }),
    } as unknown as WorkspaceCacheService,
    { execute } as unknown as CommonFindManyQueryRunnerService,
    {
      getI18nContextByApplicationId: jest
        .fn()
        .mockResolvedValue(() => untranslatedI18nContext),
    } as unknown as ApplicationTranslationCatalogService,
    {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        withWorkspaceContext(
          {
            recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
          } as ORMWorkspaceContext,
          callback,
        ),
      ),
    } as unknown as WorkspaceOrmManager,
  );

  return { service, execute };
};

describe('RecordExportQueryService', () => {
  it('selects real fields only, with the relation sub-fields nested under the relation', async () => {
    const { service } = buildService();

    const context = await service.buildContext({
      parameters,
      authContext: userAuthContext,
    });

    expect(formatRecordExportHeader(context.columns)).toBe(
      '﻿Id,Name,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Date of Birth\n',
    );
    expect(context.selectedFields).toEqual({
      edges: {
        node: {
          id: true,
          name: true,
          leadId: true,
          lead: {
            id: true,
            name: { firstName: true, lastName: true },
            dateOfBirth: true,
          },
        },
      },
    });
  });

  it('keeps the upstream columns for the system-context workspace data export', async () => {
    const { service } = buildService();

    const context = await service.buildContext({
      parameters,
      authContext: {
        type: 'system',
        workspace: { id: 'workspace-id' },
      } as unknown as WorkspaceAuthContext,
    });

    expect(formatRecordExportHeader(context.columns)).toBe('﻿Id,Name,Lead Id\n');
    expect(context.relationSubFieldExportPlan).toBeUndefined();
  });

  it('fills the relation sub-field cells of each page', async () => {
    const { service, execute } = buildService();
    const context = await service.buildContext({
      parameters,
      authContext: userAuthContext,
    });

    const { results } = await service.readPage({ parameters, context });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ selectedFields: context.selectedFields }),
      context.queryRunnerContext,
    );
    expect(results.records[0]).toEqual(
      expect.objectContaining({
        lead__id: 'lead-1',
        lead__name: { firstName: 'Ann', lastName: 'Lee' },
        lead__dateOfBirth: '1980-02-03',
      }),
    );
  });
});
