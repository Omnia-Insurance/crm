import gql from 'graphql-tag';

export const START_RECONCILIATION_APPLY = gql`
  mutation StartReconciliationApply($reconciliationId: UUID!) {
    startReconciliationApply(reconciliationId: $reconciliationId) {
      success
      reconciliationId
      status
    }
  }
`;
