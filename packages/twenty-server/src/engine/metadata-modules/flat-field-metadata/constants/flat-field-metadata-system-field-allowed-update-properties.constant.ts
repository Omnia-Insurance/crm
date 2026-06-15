import { type UniversalFlatFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-field-metadata.type';

// During a non-system (application) build, system fields are platform-managed:
// the only properties an app may update on them are these. Any other diff
// (e.g. a spurious `defaultValue` change on the auto-injected createdBy/
// updatedBy ACTOR fields, whose serialization differs from the stored value)
// must be ignored so it does not fail the whole field-metadata sync.
export const FLAT_FIELD_METADATA_SYSTEM_FIELD_ALLOWED_UPDATE_PROPERTIES = [
  'universalSettings',
  'isActive',
] as const satisfies (keyof UniversalFlatFieldMetadata)[];
