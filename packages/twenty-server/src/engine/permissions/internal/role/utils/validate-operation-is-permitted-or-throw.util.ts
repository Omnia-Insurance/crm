import { isNonEmptyString } from '@sniptt/guards';
import {
  FieldMetadataType,
  type ObjectRecordsOperationType,
  type RowLevelRecordsPermissions,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { InternalServerError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { getColumnNameToFieldMetadataIdMap } from 'src/engine/metadata-modules/flat-field-metadata/utils/get-column-name-to-field-metadata-id.util';

type ValidateOperationIsPermittedOrThrowArgs = {
  entityName: string;
  operationType: ObjectRecordsOperationType;
  recordsPermissions: RoleRecordsPermissions;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  objectIdByNameSingular: Record<string, string>;
  selectedColumns: string[];
  updatedColumns: string[];
};

export const validateOperationIsPermittedOrThrow = ({
  entityName,
  operationType,
  recordsPermissions,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  objectIdByNameSingular,
  selectedColumns,
  updatedColumns,
}: ValidateOperationIsPermittedOrThrowArgs) => {
  const objectMetadataIdForEntity = objectIdByNameSingular[entityName];

  if (!isNonEmptyString(objectMetadataIdForEntity)) {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }

  const objectMetadata = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: objectMetadataIdForEntity,
    flatEntityMaps: flatObjectMetadataMaps,
  });

  if (!isDefined(objectMetadata)) {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }

  const columnNameToFieldMetadataIdMap = getColumnNameToFieldMetadataIdMap(
    objectMetadata,
    flatFieldMetadataMaps,
  );

  const permissionsForEntity =
    recordsPermissions.objects[objectMetadataIdForEntity];

  const unreadableFields = permissionsForEntity?.unreadableFields ?? [];
  const uneditableFields = permissionsForEntity?.uneditableFields ?? [];

  switch (operationType) {
    case 'read':
    case 'destroy':
    case 'softDelete':
      validateReadFieldPermissionOrThrow({
        unreadableFields,
        selectedColumns,
        columnNameToFieldMetadataIdMap,
        entityName,
        flatFieldMetadataMaps,
      });
      break;
    case 'create':
      validateReadFieldPermissionOrThrow({
        unreadableFields,
        selectedColumns,
        columnNameToFieldMetadataIdMap,
        entityName,
        flatFieldMetadataMaps,
      });

      if (updatedColumns.length > 0) {
        // OMNIA-CUSTOM: creators also set the few fields their role locks afterwards (R-INSERT, Q16);
        // every other uneditable field is still rejected on create.
        const fieldMetadataIdsSettableOnCreate = new Set([
          ...(permissionsForEntity?.rowLevelRecordsPermissions ?? []).flatMap(
            ({ predicates }) =>
              predicates.map((predicate) => predicate.fieldMetadataId),
          ),
          ...findOmniaFieldMetadataIdsSettableOnCreate({
            rowLevelRecordsPermissions:
              permissionsForEntity?.rowLevelRecordsPermissions ?? [],
            objectMetadata,
            flatObjectMetadataMaps,
            flatFieldMetadataMaps,
          }),
        ]);

        const updatedColumnsToValidate = updatedColumns.filter(
          (column) =>
            !fieldMetadataIdsSettableOnCreate.has(
              columnNameToFieldMetadataIdMap[column],
            ),
        );

        if (updatedColumnsToValidate.length > 0) {
          validateUpdateFieldPermissionOrThrow({
            uneditableFields,
            updatedColumns: updatedColumnsToValidate,
            columnNameToFieldMetadataIdMap,
            entityName,
            flatFieldMetadataMaps,
          });
        }
      }
      break;
    case 'update':
      validateReadFieldPermissionOrThrow({
        unreadableFields,
        selectedColumns,
        columnNameToFieldMetadataIdMap,
        entityName,
        flatFieldMetadataMaps,
      });

      if (updatedColumns.length > 0) {
        validateUpdateFieldPermissionOrThrow({
          uneditableFields,
          updatedColumns,
          columnNameToFieldMetadataIdMap,
          entityName,
          flatFieldMetadataMaps,
        });
      }
      break;
    default:
      throw new PermissionsException(
        PermissionsExceptionMessage.UNKNOWN_OPERATION_NAME,
        PermissionsExceptionCode.UNKNOWN_OPERATION_NAME,
      );
  }
};

const buildFieldPermissionDeniedMessage = ({
  action,
  column,
  fieldMetadataId,
  entityName,
  flatFieldMetadataMaps,
}: {
  action: 'read' | 'write';
  column: string;
  fieldMetadataId: string;
  entityName: string;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}): string => {
  const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: fieldMetadataId,
    flatEntityMaps: flatFieldMetadataMaps,
  });
  const fieldName = fieldMetadata?.name ?? column;

  return `${PermissionsExceptionMessage.PERMISSION_DENIED}: no permission to ${action} field "${fieldName}" on "${entityName}"`;
};

const validateReadFieldPermissionOrThrow = ({
  unreadableFields,
  selectedColumns,
  columnNameToFieldMetadataIdMap,
  entityName,
  flatFieldMetadataMaps,
}: {
  unreadableFields: string[];
  selectedColumns: string[];
  columnNameToFieldMetadataIdMap: Record<string, string>;
  entityName: string;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}) => {
  if (unreadableFields.length === 0) {
    return;
  }

  for (const column of selectedColumns) {
    const fieldMetadataId = columnNameToFieldMetadataIdMap[column];

    if (!fieldMetadataId) {
      throw new InternalServerError(
        `Field metadata id not found for column name ${column}`,
      );
    }

    if (unreadableFields.includes(fieldMetadataId)) {
      throw new PermissionsException(
        buildFieldPermissionDeniedMessage({
          action: 'read',
          column,
          fieldMetadataId,
          entityName,
          flatFieldMetadataMaps,
        }),
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    }
  }
};

const validateUpdateFieldPermissionOrThrow = ({
  uneditableFields,
  updatedColumns,
  columnNameToFieldMetadataIdMap,
  entityName,
  flatFieldMetadataMaps,
}: {
  uneditableFields: string[];
  updatedColumns: string[];
  columnNameToFieldMetadataIdMap: Record<string, string>;
  entityName: string;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}) => {
  if (uneditableFields.length === 0) {
    return;
  }

  for (const column of updatedColumns) {
    const fieldMetadataId = columnNameToFieldMetadataIdMap[column];

    if (!fieldMetadataId) {
      throw new InternalServerError(
        `Field metadata id not found for column name ${column}`,
      );
    }

    if (uneditableFields.includes(fieldMetadataId)) {
      throw new PermissionsException(
        buildFieldPermissionDeniedMessage({
          action: 'write',
          column,
          fieldMetadataId,
          entityName,
          flatFieldMetadataMaps,
        }),
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    }
  }
};

// OMNIA-CUSTOM: policy creators set the agent (directly or through an RLS hop) and submittedDate,
// which their role cannot edit afterwards; RLS create validation still runs on these values.
const AGENT_PROFILE_OBJECT_NAME_SINGULAR = 'agentProfile';
const SUBMITTED_DATE_FIELD_NAME = 'submittedDate';

const isManyToOneRelationToAgentProfile = ({
  flatFieldMetadata,
  flatObjectMetadataMaps,
}: {
  flatFieldMetadata: OrmFlatFieldMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): boolean =>
  isFlatFieldMetadataOfType(flatFieldMetadata, FieldMetadataType.RELATION) &&
  flatFieldMetadata.settings?.relationType === RelationType.MANY_TO_ONE &&
  findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: flatFieldMetadata.relationTargetObjectMetadataId,
    flatEntityMaps: flatObjectMetadataMaps,
  })?.nameSingular === AGENT_PROFILE_OBJECT_NAME_SINGULAR;

const findOmniaFieldMetadataIdsSettableOnCreate = ({
  rowLevelRecordsPermissions,
  objectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  rowLevelRecordsPermissions: RowLevelRecordsPermissions[];
  objectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}): string[] => [
  ...rowLevelRecordsPermissions
    .flatMap(({ predicates }) => predicates)
    .map(({ relationFieldMetadataId }) => relationFieldMetadataId)
    .filter(isDefined),
  ...objectMetadata.fieldIds
    .map((fieldMetadataId) =>
      findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: fieldMetadataId,
        flatEntityMaps: flatFieldMetadataMaps,
      }),
    )
    .filter(isDefined)
    .filter(
      (flatFieldMetadata) =>
        flatFieldMetadata.name === SUBMITTED_DATE_FIELD_NAME ||
        isManyToOneRelationToAgentProfile({
          flatFieldMetadata,
          flatObjectMetadataMaps,
        }),
    )
    .map(({ id }) => id),
];
