import { gql } from '@apollo/client';

export const GET_IMPORT_JOB = gql`
  query GetImportJob($importJobId: String!) {
    importJob(importJobId: $importJobId) {
      id
      objectNameSingular
      fileName
      status
      totalRecords
      processedRecords
      successCount
      warningCount
      failureCount
      result
      createdAt
    }
  }
`;
