import { assertUnreachable } from 'twenty-shared/utils';

import {
  NotFoundError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';

export const ingestionPipelineGraphqlApiExceptionHandler = (error: Error) => {
  if (error instanceof IngestionPipelineException) {
    switch (error.code) {
      case IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND:
      case IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND:
        throw new NotFoundError(error);
      case IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT:
      case IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET:
      case IngestionPipelineExceptionCode.PIPELINE_DISABLED:
      case IngestionPipelineExceptionCode.PROCESSING_ERROR:
        throw new UserInputError(error);
      default: {
        return assertUnreachable(error.code);
      }
    }
  }

  throw error;
};
