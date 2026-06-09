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

export const BATCH_APPROVE_REVIEW_ITEMS = gql`
  mutation BatchApproveReviewItems(
    $reconciliationId: UUID!
    $minConfidence: Float
    $reviewItemIds: [UUID!]
  ) {
    batchApproveReviewItems(
      reconciliationId: $reconciliationId
      minConfidence: $minConfidence
      reviewItemIds: $reviewItemIds
    ) {
      success
      reconciliationId
      status
    }
  }
`;
