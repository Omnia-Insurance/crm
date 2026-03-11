import { FieldMetadataType } from 'twenty-shared/types';

import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';
import { getTsVectorColumnExpressionFromFields } from 'src/engine/workspace-manager/utils/get-ts-vector-column-expression.util';
import {
  isSearchableFieldType,
  type SearchableFieldType,
} from 'src/engine/workspace-manager/utils/is-searchable-field.util';
import { type UniversalFlatFieldMetadata } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-field-metadata.type';

type SearchVectorSourceField = {
  name: string;
  type: FieldMetadataType;
  isActive?: boolean | null;
  isSystem?: boolean | null;
};

export const getCustomObjectSearchVectorFields = (
  fields: SearchVectorSourceField[],
) => {
  return fields
    .filter(
      (
        field,
      ): field is SearchVectorSourceField & { type: SearchableFieldType } =>
        field.name !== SEARCH_VECTOR_FIELD.name &&
        field.isActive !== false &&
        field.isSystem !== true &&
        isSearchableFieldType(field.type),
    )
    .map(({ name, type }) => ({ name, type }));
};

export const buildCustomObjectSearchVectorFieldSettings = (
  fields: SearchVectorSourceField[],
): UniversalFlatFieldMetadata<FieldMetadataType.TS_VECTOR>['universalSettings'] => {
  return {
    asExpression: getTsVectorColumnExpressionFromFields(
      getCustomObjectSearchVectorFields(fields),
    ),
    generatedType: 'STORED',
  };
};
