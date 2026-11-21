import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';

import { type Response } from 'express';

import { HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';
import { IngestionPipelineException } from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { getIngestionPipelineExceptionStatusCode } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-pipeline-exception-status-code.util';

@Catch(IngestionPipelineException)
export class IngestionPipelineRestApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpExceptionHandlerService: HttpExceptionHandlerService,
  ) {}

  catch(exception: IngestionPipelineException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    return this.httpExceptionHandlerService.handleError(
      exception,
      response,
      getIngestionPipelineExceptionStatusCode(exception),
    );
  }
}
