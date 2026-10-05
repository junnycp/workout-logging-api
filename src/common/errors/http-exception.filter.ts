import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from './app-exception';
import { errorBody } from './error-body';
import { codeForStatus, ErrorCode, ErrorDetail } from './error-codes';

interface RenderedError {
  status: number;
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
}

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

    if (rendered.status >= 500 && !(exception instanceof AppException)) {
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
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const status = exception.getStatus();
      return { status, code: codeForStatus(status), message: exception.message, details: [] };
    }
    // Any other 5xx keeps its status but never exposes its message.
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    return {
      status,
      code: codeForStatus(status),
      message: 'An unexpected error occurred',
      details: [],
    };
  }
}
