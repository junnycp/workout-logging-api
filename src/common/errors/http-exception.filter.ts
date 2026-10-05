import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from './app-exception';
import { errorBody } from './error-body';
import { ErrorCode, ErrorDetail } from './error-codes';

interface RenderedError {
  status: number;
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
}

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.NOT_FOUND]: ErrorCode.ROUTE_NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Single place that turns any thrown value into the public error envelope
 * `{ error: { code, message, details }, requestId }`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  // Plain PinoLogger injection: @InjectPinoLogger only works for classes imported before
  // LoggerModule.forRoot*() runs, which silently depends on import order.
  constructor(private readonly logger: PinoLogger) {
    logger.setContext(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const requestId = typeof request.id === 'string' ? request.id : null;
    const rendered = this.render(exception);

    if (rendered.status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    }

    http
      .getResponse<Response>()
      .status(rendered.status)
      .json(errorBody(rendered.code, rendered.message, rendered.details, requestId));
  }

  private render(exception: unknown): RenderedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code:
          STATUS_CODES[status] ??
          (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
        message: exception.message,
        details: [],
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: [],
    };
  }
}
