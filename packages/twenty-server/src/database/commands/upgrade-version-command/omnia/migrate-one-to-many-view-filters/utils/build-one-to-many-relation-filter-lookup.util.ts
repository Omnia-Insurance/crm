import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { resolveEffectiveFlatEntityProperty } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity-property.util';

export type OneToManyRelationFilterLookup = {
  targetObjectMetadataIdByRelationFieldMetadataId: Map<string, string>;
  activeFlatFieldMetadataByNameByObjectMetadataId: Map<
    string,
    Map<string, FlatFieldMetadata>
  >;
};

export const buildOneToManyRelationFilterLookup = (
  flatFieldMetadatas: FlatFieldMetadata[],
): OneToManyRelationFilterLookup => {
  const targetObjectMetadataIdByRelationFieldMetadataId = new Map<
    string,
    string
  >();
  const activeFlatFieldMetadataByNameByObjectMetadataId = new Map<
    string,
    Map<string, FlatFieldMetadata>
  >();

  for (const flatFieldMetadata of flatFieldMetadatas) {
    if (
      isFlatFieldMetadataOfType(
        flatFieldMetadata,
        FieldMetadataType.RELATION,
      ) &&
      flatFieldMetadata.settings?.relationType === RelationType.ONE_TO_MANY &&
      isDefined(flatFieldMetadata.relationTargetObjectMetadataId)
    ) {
      targetObjectMetadataIdByRelationFieldMetadataId.set(
        flatFieldMetadata.id,
        flatFieldMetadata.relationTargetObjectMetadataId,
      );
    }

    // A workspace deactivates a standard field through an override, not the isActive column
    const isActive = resolveEffectiveFlatEntityProperty({
      metadataName: 'fieldMetadata',
      flatEntity: flatFieldMetadata,
      property: 'isActive',
    });

    if (isActive !== true) {
      continue;
    }

    const activeFlatFieldMetadataByName =
      activeFlatFieldMetadataByNameByObjectMetadataId.get(
        flatFieldMetadata.objectMetadataId,
      ) ?? new Map<string, FlatFieldMetadata>();

    activeFlatFieldMetadataByName.set(
      flatFieldMetadata.name,
      flatFieldMetadata,
    );
    activeFlatFieldMetadataByNameByObjectMetadataId.set(
      flatFieldMetadata.objectMetadataId,
      activeFlatFieldMetadataByName,
    );
  }

  return {
    targetObjectMetadataIdByRelationFieldMetadataId,
    activeFlatFieldMetadataByNameByObjectMetadataId,
  };
};
