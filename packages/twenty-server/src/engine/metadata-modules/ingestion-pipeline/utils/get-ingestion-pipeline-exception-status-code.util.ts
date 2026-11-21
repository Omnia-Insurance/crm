import { assertUnreachable } from 'twenty-shared/utils';

import {
  type IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';

export const getIngestionPipelineExceptionStatusCode = (
  exception: IngestionPipelineException,
): 400 | 403 | 404 | 500 => {
  switch (exception.code) {
    case IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT:
      return 400;
    case IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET:
    case IngestionPipelineExceptionCode.PIPELINE_DISABLED:
      return 403;
    case IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND:
    case IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND:
      return 404;
    case IngestionPipelineExceptionCode.PROCESSING_ERROR:
      return 500;
    default: {
      return assertUnreachable(exception.code);
    }
  }
};
