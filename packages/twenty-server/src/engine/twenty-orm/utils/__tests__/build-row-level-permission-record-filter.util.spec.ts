import {
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
  RowLevelPermissionPredicateScope,
} from 'twenty-shared/types';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRowLevelPermissionPredicateGroupMaps } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group-maps.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicateMaps } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-maps.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { buildRowLevelPermissionRecordFilter } from 'src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util';

const buildFlatEntityMaps = <T extends SyncableFlatEntity>(
  entities: T[],
): FlatEntityMaps<T> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});

const createMockFlatObjectMetadata = (
  fieldIds: string[],
): FlatObjectMetadata => ({
  id: 'policy-object-id',
  nameSingular: 'policy',
  namePlural: 'policies',
  labelSingular: 'Policy',
  labelPlural: 'Policies',
  icon: 'IconFile',
  targetTableName: 'policy',
  isCustom: false,
  isRemote: false,
  isActive: true,
  isSystem: false,
  isAuditLogged: false,
  isSearchable: false,
  workspaceId: 'workspace-id',
  universalIdentifier: 'policy-object-uid',
  indexMetadataIds: [],
  fieldIds,
  viewIds: [],
  applicationId: 'app-id',
  isLabelSyncedWithName: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  shortcut: null,
  description: null,
  standardOverrides: null,
  isUIReadOnly: false,
  labelIdentifierFieldMetadataId: null,
  imageIdentifierFieldMetadataId: null,
  duplicateCriteria: null,
  applicationUniversalIdentifier: 'app-uid',
  fieldUniversalIdentifiers: fieldIds,
  viewUniversalIdentifiers: [],
  indexMetadataUniversalIdentifiers: [],
  labelIdentifierFieldMetadataUniversalIdentifier: null,
  imageIdentifierFieldMetadataUniversalIdentifier: null,
});

const createMockFlatFieldMetadata = (
  id: string,
  name: string,
): FlatFieldMetadata =>
  ({
    id,
    name,
    type: FieldMetadataType.TEXT,
    label: name,
    objectMetadataId: 'policy-object-id',
    isLabelSyncedWithName: true,
    isNullable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    universalIdentifier: `${id}-uid`,
    viewFieldIds: [],
    viewFilterIds: [],
    kanbanAggregateOperationViewIds: [],
    calendarViewIds: [],
    mainGroupByFieldMetadataViewIds: [],
    applicationId: null,
    settings: null,
  }) as unknown as FlatFieldMetadata;

const createMockPredicate = ({
  id,
  fieldMetadataId,
  fieldMetadataUniversalIdentifier,
  scope,
  value,
}: {
  id: string;
  fieldMetadataId: string;
  fieldMetadataUniversalIdentifier: string;
  scope: RowLevelPermissionPredicateScope;
  value: string;
}): FlatRowLevelPermissionPredicate =>
  ({
    id,
    universalIdentifier: `${id}-uid`,
    fieldMetadataId,
    fieldMetadataUniversalIdentifier,
    scope,
    operand: RowLevelPermissionPredicateOperand.CONTAINS,
    value,
    subFieldName: null,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberFieldMetadataUniversalIdentifier: null,
    workspaceMemberSubFieldName: null,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionPredicateGroupUniversalIdentifier: null,
    positionInRowLevelPermissionPredicateGroup: null,
    objectMetadataId: 'policy-object-id',
    objectMetadataUniversalIdentifier: 'policy-object-uid',
    roleId: 'role-id',
    roleUniversalIdentifier: 'role-uid',
    workspaceId: 'workspace-id',
    applicationId: 'app-id',
    applicationUniversalIdentifier: 'app-uid',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }) as unknown as FlatRowLevelPermissionPredicate;

describe('buildRowLevelPermissionRecordFilter', () => {
  const fieldMetadata = [
    createMockFlatFieldMetadata('status-field-id', 'status'),
    createMockFlatFieldMetadata('queue-field-id', 'queue'),
    createMockFlatFieldMetadata('owner-field-id', 'owner'),
  ];
  const flatObjectMetadata = createMockFlatObjectMetadata(
    fieldMetadata.map((field) => field.id),
  );
  const flatFieldMetadataMaps = buildFlatEntityMaps(fieldMetadata);
  const flatRowLevelPermissionPredicateGroupMaps =
    buildFlatEntityMaps<FlatRowLevelPermissionPredicateGroup>(
      [],
    ) as FlatRowLevelPermissionPredicateGroupMaps;
  const flatRowLevelPermissionPredicateMaps = buildFlatEntityMaps([
    createMockPredicate({
      id: 'all-scope-predicate-id',
      fieldMetadataId: 'status-field-id',
      fieldMetadataUniversalIdentifier: 'status-field-id-uid',
      scope: RowLevelPermissionPredicateScope.ALL,
      value: 'open',
    }),
    createMockPredicate({
      id: 'read-scope-predicate-id',
      fieldMetadataId: 'queue-field-id',
      fieldMetadataUniversalIdentifier: 'queue-field-id-uid',
      scope: RowLevelPermissionPredicateScope.READ,
      value: 'new-business',
    }),
    createMockPredicate({
      id: 'write-scope-predicate-id',
      fieldMetadataId: 'owner-field-id',
      fieldMetadataUniversalIdentifier: 'owner-field-id-uid',
      scope: RowLevelPermissionPredicateScope.WRITE,
      value: 'agent-1',
    }),
  ]) as FlatRowLevelPermissionPredicateMaps;

  it('includes ALL and READ scoped predicates for read filters only', async () => {
    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatFieldMetadataMaps,
      objectMetadata: flatObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.READ,
      roleId: 'role-id',
    });

    expect(recordFilter).toEqual({
      and: [
        { status: { ilike: '%open%' } },
        { queue: { ilike: '%new-business%' } },
      ],
    });
  });

  it('includes ALL and WRITE scoped predicates for write filters only', async () => {
    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatFieldMetadataMaps,
      objectMetadata: flatObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.WRITE,
      roleId: 'role-id',
    });

    expect(recordFilter).toEqual({
      and: [{ status: { ilike: '%open%' } }, { owner: { ilike: '%agent-1%' } }],
    });
  });
});
