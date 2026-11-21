import { computeDeterministicUuid } from 'twenty-shared/application';

// OMNIA-CUSTOM: a copied relation sub-field column needs its own id; the
// upstream (view, field) key would give it the plain column's id
export const getRelationSubFieldViewFieldUniversalIdentifier = ({
  applicationUniversalIdentifier,
  viewUniversalIdentifier,
  fieldMetadataUniversalIdentifier,
  subFieldName,
}: {
  applicationUniversalIdentifier: string;
  viewUniversalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
  subFieldName: string;
}): string =>
  computeDeterministicUuid({
    entityNamespace: 'viewField',
    value: `${viewUniversalIdentifier}:${fieldMetadataUniversalIdentifier}:${subFieldName}`,
    applicationUniversalIdentifier,
  });
