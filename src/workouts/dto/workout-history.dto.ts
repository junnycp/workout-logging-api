import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsWeightUnit } from '../../units/is-weight-unit.validator';
import { WEIGHT_UNITS } from '../../units/weight-units';

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 100;

export class WorkoutHistoryQueryDto {
  @ApiPropertyOptional({
    example: 'bench',
    description: 'Part of an exercise name or alias, case-insensitive.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'exercise must not be blank', context: { code: 'BLANK' } })
  exercise?: string;

  @ApiPropertyOptional({
    example: 'chest',
    description:
      'Muscle group code; matches exercises that train it as a primary or secondary muscle.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  muscleGroup?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'Inclusive start: YYYY-MM-DD (read in `tz`) or an ISO-8601 datetime with an offset.',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Inclusive end: YYYY-MM-DD (the whole day in `tz`) or an ISO-8601 datetime with an offset.',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    example: 'Asia/Ho_Chi_Minh',
    default: 'UTC',
    description: 'IANA time zone for date-only bounds.',
  })
  @IsOptional()
  @IsString()
  tz?: string;

  @ApiPropertyOptional({
    enum: WEIGHT_UNITS.map((unit) => unit.code),
    description:
      'Return every weight in this unit. Omitted: each set in the unit it was logged in.',
  })
  @IsOptional()
  @IsWeightUnit()
  unit?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_HISTORY_LIMIT, default: DEFAULT_HISTORY_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit: number = DEFAULT_HISTORY_LIMIT;

  @ApiPropertyOptional({ description: '`meta.nextCursor` of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class HistorySetDto {
  @ApiProperty({ example: 1 }) setNumber!: number;
  @ApiProperty({ example: 5 }) reps!: number;
  @ApiProperty({
    example: 220.46,
    description: 'As logged, or converted from the logged value and rounded to 2 decimals',
  })
  weight!: number;
  @ApiProperty({ example: 'lb' }) unit!: string;
}

export class HistoryMuscleGroupDto {
  @ApiProperty({ example: 'chest' }) code!: string;
  @ApiProperty({ enum: ['primary', 'secondary'] }) role!: 'primary' | 'secondary';
}

export class HistoryExerciseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Bench Press' }) name!: string;
  @ApiProperty({ type: [HistoryMuscleGroupDto] }) muscleGroups!: HistoryMuscleGroupDto[];
}

export class HistoryEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10-01T11:30:00.000Z', description: 'UTC instant' })
  performedAt!: string;
  @ApiProperty({
    example: '2026-10-01',
    description: 'Calendar date at the offset it was logged with',
  })
  localDate!: string;
  @ApiProperty({ example: 420 }) utcOffsetMinutes!: number;
  @ApiProperty({ type: HistoryExerciseDto }) exercise!: HistoryExerciseDto;
  @ApiProperty({ type: [HistorySetDto] }) sets!: HistorySetDto[];
}

export class HistoryMetaDto {
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'lb' }) unit!: string | null;
  @ApiProperty({ example: 'UTC' }) timezone!: string;
  @ApiPropertyOptional({ example: 'No workouts found for the given filters.' }) message?: string;
}

export class WorkoutHistoryResponseDto {
  @ApiProperty({ type: [HistoryEntryDto] }) data!: HistoryEntryDto[];
  @ApiProperty({ type: HistoryMetaDto }) meta!: HistoryMetaDto;
}
