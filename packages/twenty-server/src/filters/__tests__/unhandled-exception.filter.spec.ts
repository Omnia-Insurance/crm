import { type ArgumentsHost, BadRequestException } from '@nestjs/common';

import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';

const buildResponse = (initialHeaders: Record<string, string> = {}) => {
  const headers = new Map(Object.entries(initialHeaders));

  return {
    headersSent: false,
    header: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    getHeader: (name: string) => headers.get(name),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
};

describe('UnhandledExceptionFilter', () => {
  const captureExceptions = jest.fn();
  const filter = new UnhandledExceptionFilter({
    captureExceptions,
  } as unknown as ExceptionHandlerService);

  const catchException = (
    exception: unknown,
    initialHeaders?: Record<string, string>,
  ) => {
    const response = buildResponse(initialHeaders);

    filter.catch(exception, {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost);

    return response;
  };

  it('answers a generic 500 instead of echoing a database error', () => {
    const exception = new Error(
      'duplicate key value violates unique constraint "IDX_PERSON_PHONE": Key (phone)=(5550100) already exists.',
    );

    const response = catchException(exception);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(captureExceptions).toHaveBeenCalledWith([exception]);
  });

  it('never echoes a response object attached to a non-HTTP error', () => {
    const exception = Object.assign(new Error('Request failed'), {
      response: { data: { phone: '5550100' } },
    });

    const response = catchException(exception);

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('keeps the body and status of an HttpException', () => {
    const exception = new BadRequestException('Invalid filter');

    const response = catchException(exception);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(exception.getResponse());
    expect(captureExceptions).not.toHaveBeenCalled();
  });

  it('adds fallback CORS headers only when the CORS middleware never ran', () => {
    const responseWithoutCors = catchException(
      new BadRequestException('Invalid body'),
    );
    const responseWithCors = catchException(
      new BadRequestException('Invalid body'),
      { 'Access-Control-Allow-Origin': 'https://crm.example.com' },
    );

    expect(responseWithoutCors.getHeader('Access-Control-Allow-Origin')).toBe(
      '*',
    );
    expect(responseWithCors.getHeader('Access-Control-Allow-Origin')).toBe(
      'https://crm.example.com',
    );
  });
});
