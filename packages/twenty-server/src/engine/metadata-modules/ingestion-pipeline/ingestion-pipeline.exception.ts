import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';

import { CustomException } from 'src/utils/custom-exception';

export enum IngestionPipelineExceptionCode {
  PIPELINE_NOT_FOUND = 'PIPELINE_NOT_FOUND',
  FIELD_MAPPING_NOT_FOUND = 'FIELD_MAPPING_NOT_FOUND',
  INVALID_PIPELINE_INPUT = 'INVALID_PIPELINE_INPUT',
  INVALID_WEBHOOK_SECRET = 'INVALID_WEBHOOK_SECRET',
  PIPELINE_DISABLED = 'PIPELINE_DISABLED',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
}

const getIngestionPipelineExceptionUserFriendlyMessage = (
  code: IngestionPipelineExceptionCode,
) => {
  switch (code) {
    case IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND:
      return msg`Ingestion pipeline not found.`;
    case IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND:
      return msg`Field mapping not found.`;
    case IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT:
      return msg`Invalid ingestion pipeline input.`;
    case IngestionPipelineExceptionCode.INVALID_WEBHOOK_SECRET:
      return msg`Invalid webhook secret.`;
    case IngestionPipelineExceptionCode.PIPELINE_DISABLED:
      return msg`Ingestion pipeline is disabled.`;
    case IngestionPipelineExceptionCode.PROCESSING_ERROR:
      return msg`Error processing ingestion data.`;
    default:
      assertUnreachable(code);
  }
};

export class IngestionPipelineException extends CustomException<IngestionPipelineExceptionCode> {
  constructor(
    message: string,
    code: IngestionPipelineExceptionCode,
    {
      userFriendlyMessage,
    }: { userFriendlyMessage?: MessageDescriptor } = {},
  ) {
    super(message, code, {
      userFriendlyMessage:
        userFriendlyMessage ??
        getIngestionPipelineExceptionUserFriendlyMessage(code),
    });
  }
}
