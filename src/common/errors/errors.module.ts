import { HttpStatus, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';
import { HttpExceptionFilter } from './http-exception.filter';
import { toErrorDetails } from './validation-details';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) =>
          new AppException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR,
            'Request validation failed',
            toErrorDetails(errors),
          ),
      }),
    },
  ],
})
export class ErrorsModule {}
