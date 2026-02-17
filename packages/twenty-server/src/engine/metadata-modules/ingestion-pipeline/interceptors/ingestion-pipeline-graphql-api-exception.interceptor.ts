import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';

import { type Observable, catchError } from 'rxjs';

import { ingestionPipelineGraphqlApiExceptionHandler } from 'src/engine/metadata-modules/ingestion-pipeline/utils/ingestion-pipeline-graphql-api-exception-handler.util';

@Injectable()
export class IngestionPipelineGraphqlApiExceptionInterceptor
  implements NestInterceptor
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(catchError(ingestionPipelineGraphqlApiExceptionHandler));
  }
}
