import { OBJECT_UNIVERSAL_IDENTIFIERS_WITHOUT_INITIAL_VIEW } from 'src/engine/metadata-modules/view/constants/initial-object-view-defaults.constant';
import { getInitialObjectViewUniversalIdentifier } from 'src/engine/metadata-modules/view/utils/get-initial-object-view-universal-identifier.util';
import { ViewKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { buildInitialViewFieldFlatEntity } from 'src/engine/metadata-modules/view/utils/build-initial-view-field-flat-entity.util';
import { computeInitialObjectViewToCreate } from 'src/engine/metadata-modules/view/utils/compute-initial-object-view-to-create.util';
// OMNIA-CUSTOM: distinct ids for copied relation sub-field columns
import { getRelationSubFieldViewFieldUniversalIdentifier } from 'src/engine/metadata-modules/view/utils/get-relation-sub-field-view-field-universal-identifier.util';
import { type UniversalFlatObjectMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-object-metadata.type';
import { type UniversalFlatViewField } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-view-field.type';
import { type UniversalFlatView } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-view.type';

type SeedInputFlatObjectMetadata = Pick<
  UniversalFlatObjectMetadata,
  | 'universalIdentifier'
  | 'labelPlural'
  | 'isRemote'
  | 'isSystem'
  | 'viewUniversalIdentifiers'
>;

type SeedInputFlatView = Pick<
  UniversalFlatView,
  'key' | 'deletedAt' | 'viewFieldUniversalIdentifiers'
>;

type SeedInputFlatViewField = Pick<
  UniversalFlatViewField,
  | 'fieldMetadataUniversalIdentifier'
  | 'isVisible'
  | 'size'
  | 'position'
  | 'aggregateOperation'
  | 'isActive'
  // OMNIA-CUSTOM: relation sub-field columns are copied with their sub-field
  | 'subFieldName'
>;

type SeedInputFlatEntityMaps = {
  flatViewMaps: {
    byUniversalIdentifier: Record<string, SeedInputFlatView | undefined>;
  };
  flatViewFieldMaps: {
    byUniversalIdentifier: Record<string, SeedInputFlatViewField | undefined>;
  };
};

export type SeedOperations = {
  viewsToCreate: UniversalFlatView[];
  viewFieldsToCreate: UniversalFlatViewField[];
};

export const computeMissingInitialObjectViewOperations = ({
  flatObjectMetadatas,
  flatViewMaps,
  flatViewFieldMaps,
  initialViewApplicationUniversalIdentifier,
}: SeedInputFlatEntityMaps & {
  flatObjectMetadatas: SeedInputFlatObjectMetadata[];
  initialViewApplicationUniversalIdentifier: string;
}): SeedOperations => {
  const seedOperations: SeedOperations = {
    viewsToCreate: [],
    viewFieldsToCreate: [],
  };

  const createdAt = new Date().toISOString();

  for (const flatObjectMetadata of flatObjectMetadatas) {
    if (
      flatObjectMetadata.isRemote ||
      flatObjectMetadata.isSystem ||
      OBJECT_UNIVERSAL_IDENTIFIERS_WITHOUT_INITIAL_VIEW.has(
        flatObjectMetadata.universalIdentifier,
      )
    ) {
      continue;
    }

    const flatIndexView = flatObjectMetadata.viewUniversalIdentifiers
      .map(
        (viewUniversalIdentifier) =>
          flatViewMaps.byUniversalIdentifier[viewUniversalIdentifier],
      )
      .find(
        (flatView) =>
          isDefined(flatView) &&
          flatView.key === ViewKey.INDEX &&
          !isDefined(flatView.deletedAt),
      );

    if (!isDefined(flatIndexView)) {
      continue;
    }

    const initialViewUniversalIdentifier =
      getInitialObjectViewUniversalIdentifier({
        viewApplicationUniversalIdentifier:
          initialViewApplicationUniversalIdentifier,
        objectUniversalIdentifier: flatObjectMetadata.universalIdentifier,
      });

    const existingInitialFlatView =
      flatViewMaps.byUniversalIdentifier[initialViewUniversalIdentifier];

    if (isDefined(existingInitialFlatView)) {
      continue;
    }

    seedOperations.viewsToCreate.push(
      computeInitialObjectViewToCreate({
        objectMetadata: flatObjectMetadata,
        applicationUniversalIdentifier:
          initialViewApplicationUniversalIdentifier,
      }),
    );

    for (const viewFieldUniversalIdentifier of flatIndexView.viewFieldUniversalIdentifiers) {
      const flatViewField =
        flatViewFieldMaps.byUniversalIdentifier[viewFieldUniversalIdentifier];

      if (!isDefined(flatViewField)) {
        continue;
      }

      const initialFlatViewField = buildInitialViewFieldFlatEntity({
        applicationUniversalIdentifier:
          initialViewApplicationUniversalIdentifier,
        initialViewUniversalIdentifier,
        fieldMetadataUniversalIdentifier:
          flatViewField.fieldMetadataUniversalIdentifier,
        isVisible: flatViewField.isVisible,
        size: flatViewField.size,
        position: flatViewField.position,
        aggregateOperation: flatViewField.aggregateOperation,
        isActive: flatViewField.isActive,
        createdAt,
      });

      // OMNIA-CUSTOM: a relation sub-field column keeps its sub-field and gets
      // its own id; sharing the plain column's id fails the whole seed
      seedOperations.viewFieldsToCreate.push(
        isDefined(flatViewField.subFieldName)
          ? {
              ...initialFlatViewField,
              universalIdentifier:
                getRelationSubFieldViewFieldUniversalIdentifier({
                  applicationUniversalIdentifier:
                    initialViewApplicationUniversalIdentifier,
                  viewUniversalIdentifier: initialViewUniversalIdentifier,
                  fieldMetadataUniversalIdentifier:
                    flatViewField.fieldMetadataUniversalIdentifier,
                  subFieldName: flatViewField.subFieldName,
                }),
              subFieldName: flatViewField.subFieldName,
            }
          : initialFlatViewField,
      );
    }
  }

  return seedOperations;
};
