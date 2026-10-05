import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-codes';

/** OpenAPI description of the error envelope; the runtime shape is built by `errorBody()`. */
export class ErrorDetailDto {
  @ApiProperty({ example: 'entries[0].sets[1].unit' }) path!: string;
  @ApiProperty({ example: 'UNSUPPORTED_UNIT' }) code!: string;
  @ApiProperty({ example: "Unit 'stone' is not supported. Supported: kg, lb" }) message!: string;
}

export class ErrorDto {
  @ApiProperty({ enum: Object.values(ErrorCode), example: ErrorCode.VALIDATION_ERROR })
  code!: ErrorCode;
  @ApiProperty({ example: 'Request validation failed' }) message!: string;
  @ApiProperty({ type: [ErrorDetailDto] }) details!: ErrorDetailDto[];
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDto }) error!: ErrorDto;
  @ApiProperty({ type: String, nullable: true, example: '5c941e4d-30ec-47ed-80de-7b9e3b3cfc6f' })
  requestId!: string | null;
}
