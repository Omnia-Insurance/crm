import {
  FieldMetadataType,
  type RowLevelPermissionPredicate,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { SYNTHETIC_WORKSPACE_MEMBER_ID } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/synthetic-workspace-member-id.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type RowLevelPermissionMemberFieldValues } from 'src/engine/permissions/internal/rls/types/row-level-permission-member-field-values.type';
import { buildMemberFieldKey } from 'src/engine/permissions/internal/rls/utils/build-member-field-key.util';

const RECORD_ID_FIELD_TYPES: FieldMetadataType[] = [
  FieldMetadataType.RELATION,
  FieldMetadataType.MORPH_RELATION,
  FieldMetadataType.UUID,
];

const NUMERIC_FIELD_TYPES: FieldMetadataType[] = [
  FieldMetadataType.NUMBER,
  FieldMetadataType.NUMERIC,
  FieldMetadataType.POSITION,
  FieldMetadataType.CURRENCY,
];

const DATE_FIELD_TYPES: FieldMetadataType[] = [
  FieldMetadataType.DATE,
  FieldMetadataType.DATE_TIME,
];

// A value that does not parse for the compared field would itself compile to nothing and be misreported
const buildSyntheticValueForComparedField = (
  comparedFieldMetadata: OrmFlatFieldMetadata | undefined,
): string => {
  if (
    !isDefined(comparedFieldMetadata) ||
    RECORD_ID_FIELD_TYPES.includes(comparedFieldMetadata.type)
  ) {
    return SYNTHETIC_WORKSPACE_MEMBER_ID;
  }

  const [firstOption] = comparedFieldMetadata.options ?? [];

  if (isDefined(firstOption)) {
    return firstOption.value;
  }

  if (NUMERIC_FIELD_TYPES.includes(comparedFieldMetadata.type)) {
    return '1';
  }

  if (comparedFieldMetadata.type === FieldMetadataType.BOOLEAN) {
    return 'true';
  }

  if (DATE_FIELD_TYPES.includes(comparedFieldMetadata.type)) {
    return '2000-01-01T00:00:00.000Z';
  }

  return 'omnia-verify-permissions';
};

export const buildSyntheticMemberFieldValues = ({
  predicates,
  flatFieldMetadataMaps,
}: {
  predicates: Pick<
    RowLevelPermissionPredicate,
    | 'fieldMetadataId'
    | 'workspaceMemberFieldMetadataId'
    | 'workspaceMemberSubFieldName'
  >[];
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
}): RowLevelPermissionMemberFieldValues =>
  Object.fromEntries(
    predicates
      .filter(({ workspaceMemberFieldMetadataId }) =>
        isDefined(workspaceMemberFieldMetadataId),
      )
      .map((predicate) => [
        buildMemberFieldKey(predicate),
        buildSyntheticValueForComparedField(
          findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: predicate.fieldMetadataId,
            flatEntityMaps: flatFieldMetadataMaps,
          }),
        ),
      ]),
  );
