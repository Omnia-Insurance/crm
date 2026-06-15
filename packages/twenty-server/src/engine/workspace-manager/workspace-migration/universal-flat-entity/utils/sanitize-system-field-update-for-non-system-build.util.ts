import {
  ALL_METADATA_NAME,
  type AllMetadataName,
} from 'twenty-shared/metadata';

import { type MetadataUniversalFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/metadata-universal-flat-entity.type';
import { FLAT_FIELD_METADATA_SYSTEM_FIELD_ALLOWED_UPDATE_PROPERTIES } from 'src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-system-field-allowed-update-properties.constant';
import { type UniversalFlatFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-field-metadata.type';
import { type UniversalFlatEntityUpdate } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-entity-update.type';
import { type WorkspaceMigrationBuilderOptions } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration-builder-options.type';

// On a non-system (application) build, the app manifest re-declares the standard
// system fields (createdBy/updatedBy, ...). Their serialized `defaultValue` can
// differ from the stored value and produce a spurious diff the server refuses
// to apply (system fields only allow updating universalSettings/isActive), which
// fails the entire field-metadata sync and blocks adding new app fields.
//
// Restrict a system field's update to the platform-allowed properties; return
// undefined when nothing applicable remains so the field is not treated as
// updated at all. System builds are left untouched so legitimate platform
// changes to system fields still apply.
export const sanitizeSystemFieldUpdateForNonSystemBuild = <
  T extends AllMetadataName,
>({
  metadataName,
  fromUniversalFlatEntity,
  update,
  buildOptions,
}: {
  metadataName: T;
  fromUniversalFlatEntity: MetadataUniversalFlatEntity<T>;
  update: UniversalFlatEntityUpdate<T>;
  buildOptions: WorkspaceMigrationBuilderOptions;
}): UniversalFlatEntityUpdate<T> | undefined => {
  if (
    metadataName !== ALL_METADATA_NAME.fieldMetadata ||
    buildOptions.isSystemBuild
  ) {
    return update;
  }

  const isSystemField =
    (fromUniversalFlatEntity as UniversalFlatFieldMetadata).isSystem === true;

  if (!isSystemField) {
    return update;
  }

  const allowedProperties = new Set<string>(
    FLAT_FIELD_METADATA_SYSTEM_FIELD_ALLOWED_UPDATE_PROPERTIES,
  );

  const sanitizedEntries = Object.entries(
    update as Record<string, unknown>,
  ).filter(([property]) => allowedProperties.has(property));

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries) as UniversalFlatEntityUpdate<T>;
};
