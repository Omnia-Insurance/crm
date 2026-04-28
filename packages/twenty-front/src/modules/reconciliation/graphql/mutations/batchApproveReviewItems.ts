import gql from 'graphql-tag';

export const BATCH_APPROVE_REVIEW_ITEMS = gql`
  mutation BatchApproveReviewItems(
    $reconciliationId: UUID!
    $minConfidence: Float
  ) {
    batchApproveReviewItems(
      reconciliationId: $reconciliationId
      minConfidence: $minConfidence
    ) {
      success
      reconciliationId
      status
    }
  }
`;
