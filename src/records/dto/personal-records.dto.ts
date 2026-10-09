import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsWeightUnit } from '../../units/is-weight-unit.validator';
import { WEIGHT_UNITS } from '../../units/weight-units';
import { DetailCode } from '../../common/errors/error-codes';

const UNIT_CODES = WEIGHT_UNITS.map((unit) => unit.code);
export const PERIODS = ['week', 'month', 'year'] as const;

class RecordsBaseQueryDto {
  @ApiProperty({ example: 'Bench Press', description: 'Catalog name or alias, case-insensitive.' })
  @IsDefined()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'exercise must not be blank', context: { code: DetailCode.BLANK } })
  exercise!: string;

  @ApiPropertyOptional({ enum: UNIT_CODES, default: 'kg', description: 'Unit of every value.' })
  @IsOptional()
  @IsWeightUnit()
  unit?: string;

  @ApiPropertyOptional({
    example: 'Asia/Ho_Chi_Minh',
    default: 'UTC',
    description: 'IANA time zone for date-only bounds and periods.',
  })
  @IsOptional()
  @IsString()
  tz?: string;
}

export class PersonalRecordsQueryDto extends RecordsBaseQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      'Inclusive start: YYYY-MM-DD (read in `tz`) or an ISO-8601 datetime with an offset.',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description:
      'Inclusive end: YYYY-MM-DD (the whole day in `tz`) or an ISO-8601 datetime with an offset.',
  })
  @IsOptional()
  @IsString()
  to?: string;
}

export class CompareRecordsQueryDto extends RecordsBaseQueryDto {
  @ApiPropertyOptional({
    enum: PERIODS,
    description:
      'This period to date against the whole previous one, in `tz` (weeks start on Monday). ' +
      'Use either `period` or all four explicit bounds.',
  })
  @IsOptional()
  @IsIn(PERIODS)
  period?: (typeof PERIODS)[number];

  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsString() currentFrom?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsString() currentTo?: string;
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @IsString() previousFrom?: string;
  @ApiPropertyOptional({ example: '2026-09-30' }) @IsOptional() @IsString() previousTo?: string;
}

export class RecordSetDto {
  @ApiProperty({ example: 10 }) reps!: number;
  @ApiProperty({
    example: 80,
    description: 'As logged when `unit` matches, otherwise converted and rounded to 2 decimals',
  })
  weight!: number;
}

export class PersonalRecordDto {
  @ApiProperty({ example: 106.67, description: 'In `unit`, rounded to 2 decimals' }) value!: number;
  @ApiProperty({ type: RecordSetDto }) set!: RecordSetDto;
  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' }) achievedAt!: string;
  @ApiProperty({ example: '2026-09-05', description: 'Date at the offset it was logged with' })
  localDate!: string;
  @ApiProperty({ format: 'uuid' }) entryId!: string;
  @ApiProperty({ example: 1 }) setNumber!: number;
}

export class RecordsExerciseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Bench Press' }) name!: string;
}

export class RecordRangeDto {
  @ApiProperty({ type: String, nullable: true, description: 'Inclusive UTC instant' })
  from!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Inclusive UTC instant' })
  to!: string | null;
  @ApiProperty({ example: 'UTC' }) timezone!: string;
}

export class RecordSetOfMetricsDto {
  @ApiProperty({ type: PersonalRecordDto, nullable: true }) maxWeight!: PersonalRecordDto | null;
  @ApiProperty({ type: PersonalRecordDto, nullable: true }) maxVolume!: PersonalRecordDto | null;
  @ApiProperty({ type: PersonalRecordDto, nullable: true })
  bestEstimated1RM!: PersonalRecordDto | null;
}

export class PersonalRecordsDataDto extends RecordSetOfMetricsDto {
  @ApiProperty({ type: RecordsExerciseDto }) exercise!: RecordsExerciseDto;
  @ApiProperty({ example: 'kg' }) unit!: string;
  @ApiProperty({ type: RecordRangeDto }) range!: RecordRangeDto;
}

export class RecordsMetaDto {
  @ApiPropertyOptional({ example: 'No weighted sets found for this exercise in the given range.' })
  message?: string;
}

export class PersonalRecordsResponseDto {
  @ApiProperty({ type: PersonalRecordsDataDto }) data!: PersonalRecordsDataDto;
  @ApiProperty({ type: RecordsMetaDto }) meta!: RecordsMetaDto;
}

export class PeriodRecordsDto extends RecordSetOfMetricsDto {
  @ApiProperty({ example: '2026-10-01T00:00:00.000Z', description: 'Inclusive UTC instant' })
  from!: string;
  @ApiProperty({ example: '2026-10-15T05:00:00.000Z', description: 'Inclusive UTC instant' })
  to!: string;
}

export class RecordDeltaDto {
  @ApiProperty({ example: 5, description: 'current - previous, in `unit`' }) absolute!: number;
  @ApiProperty({ example: 5.26 }) percent!: number;
  @ApiProperty({ description: 'Strictly better than the previous period' }) improved!: boolean;
}

export class RecordDeltasDto {
  @ApiProperty({ type: RecordDeltaDto, nullable: true }) maxWeight!: RecordDeltaDto | null;
  @ApiProperty({ type: RecordDeltaDto, nullable: true }) maxVolume!: RecordDeltaDto | null;
  @ApiProperty({ type: RecordDeltaDto, nullable: true })
  bestEstimated1RM!: RecordDeltaDto | null;
}

export class CompareRecordsDataDto {
  @ApiProperty({ type: RecordsExerciseDto }) exercise!: RecordsExerciseDto;
  @ApiProperty({ example: 'kg' }) unit!: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone!: string;
  @ApiProperty({ type: PeriodRecordsDto }) current!: PeriodRecordsDto;
  @ApiProperty({ type: PeriodRecordsDto }) previous!: PeriodRecordsDto;
  @ApiProperty({ type: RecordDeltasDto }) delta!: RecordDeltasDto;
}

export class CompareRecordsResponseDto {
  @ApiProperty({ type: CompareRecordsDataDto }) data!: CompareRecordsDataDto;
  @ApiProperty({ type: RecordsMetaDto }) meta!: RecordsMetaDto;
}
