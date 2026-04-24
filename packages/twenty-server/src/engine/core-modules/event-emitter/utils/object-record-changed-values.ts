import { FieldMetadataType, type ObjectRecord } from 'twenty-shared/types';
import { fastDeepEqual } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export const objectRecordChangedValues = (
  oldRecord: Partial<ObjectRecord>,
  newRecord: Partial<ObjectRecord>,
  objectMetadataItem: FlatObjectMetadata,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
) => {
  const { fieldIdByName, fieldIdByJoinColumnName } =
    buildFieldMapsFromFlatObjectMetadata(
      flatFieldMetadataMaps,
      objectMetadataItem,
    );

  return Object.keys(newRecord).reduce(
    (acc, key) => {
      const fieldId = fieldIdByName[key];
      const joinColumnFieldId = !fieldId
        ? fieldIdByJoinColumnName[key]
        : undefined;
      const resolvedFieldId = fieldId ?? joinColumnFieldId;

      const field = resolvedFieldId
        ? findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: resolvedFieldId,
            flatEntityMaps: flatFieldMetadataMaps,
          })
        : undefined;

      const oldRecordValue = oldRecord[key];
      const newRecordValue = newRecord[key];

      if (key === 'updatedAt' || key === 'searchVector') {
        return acc;
      }

      // Skip eagerly-loaded relation objects (matched by field name, not join column)
      if (
        fieldId &&
        (field?.type === FieldMetadataType.RELATION ||
          field?.type === FieldMetadataType.MORPH_RELATION)
      ) {
        return acc;
      }

      if (fastDeepEqual(oldRecordValue, newRecordValue)) {
        return acc;
      }

      // Use the relation field name as the output key for join column changes
      const outputKey = joinColumnFieldId && field ? field.name : key;

      acc[outputKey] = { before: oldRecordValue, after: newRecordValue };

      return acc;
    },

    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    {} as Record<string, { before: any; after: any }>,
  );
};
