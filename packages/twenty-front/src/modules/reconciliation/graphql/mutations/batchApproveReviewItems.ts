import gql from 'graphql-tag';

export const BATCH_APPLY_REVIEW_ITEMS = gql`
  mutation BatchApplyReviewItems(
    $reconciliationId: UUID!
    $action: String!
    $minConfidence: Float
    $reviewItemIds: [UUID!]
  ) {
    batchApplyReviewItems(
      reconciliationId: $reconciliationId
      action: $action
      minConfidence: $minConfidence
      reviewItemIds: $reviewItemIds
    ) {
      success
      reconciliationId
      status
    }
  }
`;
