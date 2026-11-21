import { type DisableableObjectPermissionAction } from 'twenty-shared/application';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export type OmniaMissingStandardObjectDisabledActions = {
  objectMetadataId: string;
  nameSingular: string;
  missingActions: DisableableObjectPermissionAction[];
};

export const computeOmniaMissingStandardObjectDisabledActions = ({
  objectMetadatas,
  expectedDisabledActionsByUniversalIdentifier,
}: {
  objectMetadatas: Pick<
    FlatObjectMetadata,
    | 'id'
    | 'universalIdentifier'
    | 'nameSingular'
    | 'disabledObjectPermissionActions'
  >[];
  expectedDisabledActionsByUniversalIdentifier: Record<
    string,
    DisableableObjectPermissionAction[]
  >;
}): OmniaMissingStandardObjectDisabledActions[] =>
  objectMetadatas.flatMap((objectMetadata) => {
    const expectedActions =
      expectedDisabledActionsByUniversalIdentifier[
        objectMetadata.universalIdentifier
      ];

    if (!isNonEmptyArray(expectedActions)) {
      return [];
    }

    const disabledActions: string[] =
      objectMetadata.disabledObjectPermissionActions ?? [];

    const missingActions = expectedActions.filter(
      (action) => !disabledActions.includes(action),
    );

    return isNonEmptyArray(missingActions)
      ? [
          {
            objectMetadataId: objectMetadata.id,
            nameSingular: objectMetadata.nameSingular,
            missingActions,
          },
        ]
      : [];
  });
