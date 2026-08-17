import { buildExpandedSelectedPaths } from 'src/engine/core-modules/export-job/jobs/export-job.processor';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';

const LEAD_OBJECT_ID = 'obj-person';
const NAME_FIELD_ID = 'fld-person-name';

const flatObjectMetadataMaps = {
  byUniversalIdentifier: {
    person: {
      id: LEAD_OBJECT_ID,
      nameSingular: 'person',
      labelIdentifierFieldMetadataId: NAME_FIELD_ID,
    },
  },
} as unknown as FlatEntityMaps<FlatObjectMetadata>;

const flatFieldMetadataMaps = {
  byUniversalIdentifier: {
    name: {
      id: NAME_FIELD_ID,
      objectMetadataId: LEAD_OBJECT_ID,
      name: 'name',
      label: 'Name',
    },
  },
} as unknown as FlatEntityMaps<FlatFieldMetadata>;

const buildPaths = (selectedFieldPaths: string[]) =>
  buildExpandedSelectedPaths(
    {
      relationFieldName: 'lead',
      relationFieldLabel: 'Lead',
      targetObjectNameSingular: 'person',
      selectedFieldPaths,
    },
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  );

describe('buildExpandedSelectedPaths', () => {
  // Regression guard: an export without the related record's id forces a
  // re-import down the SMART_UPDATE fuzzy-matching path, which silently
  // re-points policies onto newly-created blank leads (OMN-465).
  it('always includes the related record id', () => {
    expect(buildPaths(['dateOfBirth'])).toContain('id');
  });

  it('puts id first so it leads the relation column group', () => {
    expect(buildPaths(['dateOfBirth'])[0]).toBe('id');
  });

  it('includes the label identifier field alongside id', () => {
    const paths = buildPaths(['dateOfBirth']);

    expect(paths).toEqual(['id', 'name', 'dateOfBirth']);
  });

  it('does not duplicate id when it is already selected', () => {
    const paths = buildPaths(['id', 'dateOfBirth']);

    expect(paths.filter((path) => path === 'id')).toHaveLength(1);
  });

  it('does not duplicate the label identifier when already selected', () => {
    const paths = buildPaths(['name']);

    expect(paths.filter((path) => path === 'name')).toHaveLength(1);
    expect(paths).toEqual(['id', 'name']);
  });

  it('still returns id when the label identifier cannot be resolved', () => {
    const paths = buildExpandedSelectedPaths(
      {
        relationFieldName: 'lead',
        relationFieldLabel: 'Lead',
        targetObjectNameSingular: 'unknownObject',
        selectedFieldPaths: ['dateOfBirth'],
      },
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    );

    expect(paths).toEqual(['id', 'dateOfBirth']);
  });
});
