import { gql } from '@apollo/client';

export const VIEW_FIELD_FRAGMENT = gql`
  fragment ViewFieldFragment on ViewField {
    id
    fieldMetadataId
    viewId
    isVisible
    position
    size
    aggregateOperation
    viewFieldGroupId
    # OMNIA-CUSTOM: relation sub-field columns (contract C6)
    subFieldName
    isActive
    createdAt
    updatedAt
    deletedAt
  }
`;
