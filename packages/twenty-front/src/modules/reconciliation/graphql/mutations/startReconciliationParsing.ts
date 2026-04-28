import gql from 'graphql-tag';

export const START_RECONCILIATION_PARSING = gql`
  mutation StartReconciliationParsing($reconciliationId: UUID!) {
    startReconciliationParsing(reconciliationId: $reconciliationId) {
      success
      reconciliationId
      status
    }
  }
`;
