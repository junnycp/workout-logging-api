import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

function hostFor(request: object) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function catchWith(exception: unknown, request: object = { id: 'req-1' }) {
  const logger = { error: jest.fn(), setContext: jest.fn() } as unknown as PinoLogger;
  const { host, response } = hostFor(request);
  new HttpExceptionFilter(logger).catch(exception, host);
  const [[status]] = response.status.mock.calls as [[number]];
  const [[body]] = response.json.mock.calls as [[unknown]];
  return { status, body, logger };
}

describe('HttpExceptionFilter', () => {
  it('renders an AppException with its code, message, details and the request id', () => {
    const details = [{ path: 'entries[0].date', code: 'REQUIRED', message: 'date is required' }];
    const { status, body } = catchWith(
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        details,
      ),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      requestId: 'req-1',
    });
  });

  it('renders an unknown route as 404 ROUTE_NOT_FOUND', () => {
    const { status, body } = catchWith(new NotFoundException('Cannot GET /nope'));
    expect(status).toBe(404);
    expect(body).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Cannot GET /nope', details: [] },
    });
  });

  it('renders other HttpExceptions with a code derived from the status', () => {
    const { status, body } = catchWith(new BadRequestException('bad'));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'BAD_REQUEST', message: 'bad' } });
  });

  it('maps an unlisted 5xx HttpException to INTERNAL_ERROR', () => {
    const { status, body } = catchWith(new HttpException('gateway down', HttpStatus.BAD_GATEWAY));
    expect(status).toBe(502);
    expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('hides unexpected errors behind a generic 500 and logs them with the request id', () => {
    const { status, body, logger } = catchWith(new Error('db password leaked in message'));
    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: [] },
      requestId: 'req-1',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-1', err: expect.any(Error) as unknown }),
      'Unhandled exception',
    );
  });

  it('returns a null requestId when the request has none', () => {
    const { body } = catchWith(new NotFoundException(), {});
    expect(body).toMatchObject({ requestId: null });
  });
});
