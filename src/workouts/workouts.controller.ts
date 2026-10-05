import { Body, Controller, Headers, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ErrorResponseDto } from '../common/openapi/error-response.dto';
import { CreateWorkoutsDto, UserParamsDto } from './dto/create-workouts.dto';
import { CreatedWorkoutsResponseDto } from './dto/created-workouts.dto';
import { WorkoutLoggingService } from './workout-logging.service';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{1,128}$/;

@ApiTags('workouts')
@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(private readonly logging: WorkoutLoggingService) {}

  @Post()
  @ApiOperation({
    summary: 'Log one or more exercises with their sets (all-or-nothing)',
    description:
      'Weights are stored as entered and normalized to kg. Exercises must exist in the catalog (names or ' +
      'aliases, case-insensitive). With Idempotency-Key, a retry of the same body returns the stored response.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Up to 128 characters: letters, digits, `_ . : -`. Scoped per user.',
  })
  @ApiCreatedResponse({ type: CreatedWorkoutsResponseDto })
  @ApiOkResponse({
    type: CreatedWorkoutsResponseDto,
    description:
      'Replay of an earlier request with the same Idempotency-Key (header Idempotent-Replayed: true)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR or MALFORMED_JSON',
  })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'IDEMPOTENCY_KEY_REUSED' })
  async create(
    @Param() { userId }: UserParamsDto,
    @Body() dto: CreateWorkoutsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CreatedWorkoutsResponseDto> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        [
          {
            path: 'Idempotency-Key',
            code: 'MATCHES',
            message: 'Idempotency-Key must be 1-128 characters: letters, digits, _ . : -',
          },
        ],
      );
    }
    const result = await this.logging.logWorkouts(userId, dto, req.body, idempotencyKey);
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}
