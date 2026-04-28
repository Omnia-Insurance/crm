import gql from 'graphql-tag';

export const START_COMMISSION_PARSING = gql`
  mutation StartCommissionParsing($statementId: UUID!) {
    startCommissionParsing(statementId: $statementId) {
      success
      reconciliationId
      status
    }
  }
`;
