import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/openapi/error-response.dto';
import { UserParamsDto } from '../workouts/dto/create-workouts.dto';
import {
  CompareRecordsQueryDto,
  CompareRecordsResponseDto,
  PersonalRecordsQueryDto,
  PersonalRecordsResponseDto,
} from './dto/personal-records.dto';
import { PersonalRecordsService } from './personal-records.service';

@ApiTags('personal-records')
@Controller('users/:userId/personal-records')
export class PersonalRecordsController {
  constructor(private readonly records: PersonalRecordsService) {}

  @Get()
  @ApiOperation({
    summary: 'Heaviest set, highest-volume set and best Epley 1RM for one exercise',
    description:
      'Ties: more reps, then the earliest date, then the first set logged. Bodyweight sets (weight 0) ' +
      'never count. No sets → records are null with `meta.message`.',
  })
  @ApiOkResponse({ type: PersonalRecordsResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR (incl. UNKNOWN_EXERCISE with suggestions) or INVALID_DATE_RANGE',
  })
  personalRecords(
    @Param() { userId }: UserParamsDto,
    @Query() query: PersonalRecordsQueryDto,
  ): Promise<PersonalRecordsResponseDto> {
    return this.records.records(userId, query);
  }

  @Get('compare')
  @ApiOperation({
    summary: 'Compare the records of two periods (e.g. this month vs last month)',
    description:
      'Each period’s record is its best set. `period` compares the current period to date with the ' +
      'whole previous one in `tz`; or pass all four explicit bounds.',
  })
  @ApiOkResponse({ type: CompareRecordsResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR (incl. UNKNOWN_EXERCISE) or INVALID_DATE_RANGE',
  })
  compare(
    @Param() { userId }: UserParamsDto,
    @Query() query: CompareRecordsQueryDto,
  ): Promise<CompareRecordsResponseDto> {
    return this.records.compare(userId, query);
  }
}
