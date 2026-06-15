import { ALL_METADATA_NAME } from 'twenty-shared/metadata';

import { type MetadataUniversalFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/metadata-universal-flat-entity.type';
import { sanitizeSystemFieldUpdateForNonSystemBuild } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/sanitize-system-field-update-for-non-system-build.util';
import { type WorkspaceMigrationBuilderOptions } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration-builder-options.type';

const appBuildOptions: WorkspaceMigrationBuilderOptions = {
  isSystemBuild: false,
  applicationUniversalIdentifier: 'app-uuid',
};
const systemBuildOptions: WorkspaceMigrationBuilderOptions = {
  isSystemBuild: true,
  applicationUniversalIdentifier: 'app-uuid',
};

const systemField = {
  isSystem: true,
} as unknown as MetadataUniversalFlatEntity<
  typeof ALL_METADATA_NAME.fieldMetadata
>;
const customField = {
  isSystem: false,
} as unknown as MetadataUniversalFlatEntity<
  typeof ALL_METADATA_NAME.fieldMetadata
>;

describe('sanitizeSystemFieldUpdateForNonSystemBuild', () => {
  it('drops a system field update that only changes immutable properties (app build)', () => {
    const result = sanitizeSystemFieldUpdateForNonSystemBuild({
      metadataName: ALL_METADATA_NAME.fieldMetadata,
      fromUniversalFlatEntity: systemField,
      update: { defaultValue: "{'name':''}" } as never,
      buildOptions: appBuildOptions,
    });

    expect(result).toBeUndefined();
  });

  it('keeps allowed system field properties (app build)', () => {
    const result = sanitizeSystemFieldUpdateForNonSystemBuild({
      metadataName: ALL_METADATA_NAME.fieldMetadata,
      fromUniversalFlatEntity: systemField,
      update: { isActive: false, defaultValue: 'x' } as never,
      buildOptions: appBuildOptions,
    });

    expect(result).toEqual({ isActive: false });
  });

  it('leaves custom field updates untouched', () => {
    const update = { defaultValue: 'x', label: 'New' } as never;
    const result = sanitizeSystemFieldUpdateForNonSystemBuild({
      metadataName: ALL_METADATA_NAME.fieldMetadata,
      fromUniversalFlatEntity: customField,
      update,
      buildOptions: appBuildOptions,
    });

    expect(result).toBe(update);
  });

  it('leaves system builds untouched so platform changes still apply', () => {
    const update = { defaultValue: 'x' } as never;
    const result = sanitizeSystemFieldUpdateForNonSystemBuild({
      metadataName: ALL_METADATA_NAME.fieldMetadata,
      fromUniversalFlatEntity: systemField,
      update,
      buildOptions: systemBuildOptions,
    });

    expect(result).toBe(update);
  });

  it('leaves non-field metadata untouched', () => {
    const update = { foo: 'bar' } as never;
    const result = sanitizeSystemFieldUpdateForNonSystemBuild({
      metadataName: ALL_METADATA_NAME.objectMetadata,
      fromUniversalFlatEntity: systemField as never,
      update,
      buildOptions: appBuildOptions,
    });

    expect(result).toBe(update);
  });
});
