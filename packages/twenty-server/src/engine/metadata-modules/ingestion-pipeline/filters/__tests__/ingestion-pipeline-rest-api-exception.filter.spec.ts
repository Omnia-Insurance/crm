import { type ArgumentsHost } from '@nestjs/common';

import { type HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';
import { IngestionPipelineRestApiExceptionFilter } from 'src/engine/metadata-modules/ingestion-pipeline/filters/ingestion-pipeline-rest-api-exception.filter';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';

describe('IngestionPipelineRestApiExceptionFilter', () => {
  it.each([
    [IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET, 403],
    [IngestionPipelineExceptionCode.PIPELINE_DISABLED, 403],
    [IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND, 404],
    [IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT, 400],
    [IngestionPipelineExceptionCode.PROCESSING_ERROR, 500],
  ])('answers %s with %i', (code, expectedStatusCode) => {
    const handleError = jest.fn();
    const response = {};
    const filter = new IngestionPipelineRestApiExceptionFilter({
      handleError,
    } as unknown as HttpExceptionHandlerService);
    const exception = new IngestionPipelineException('Rejected push', code);

    filter.catch(exception, {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost);

    expect(handleError).toHaveBeenCalledWith(
      exception,
      response,
      expectedStatusCode,
    );
  });
});
