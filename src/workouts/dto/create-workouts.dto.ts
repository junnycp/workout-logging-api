import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaxDecimalPlaces } from '../../common/validation/max-decimal-places.validator';
import { IsWeightUnit } from '../../units/is-weight-unit.validator';
import { WEIGHT_UNITS } from '../../units/weight-units';

export const MAX_ENTRIES_PER_REQUEST = 100;
export const MAX_SETS_PER_ENTRY = 50;

export class WorkoutSetInputDto {
  @ApiProperty({ minimum: 1, maximum: 1000, example: 5 })
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(1000)
  reps!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 2000,
    example: 100,
    description: 'In `unit`; at most 3 decimals. 0 = bodyweight.',
  })
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @MaxDecimalPlaces(3)
  @Min(0)
  @Max(2000)
  weight!: number;

  @ApiProperty({ enum: WEIGHT_UNITS.map((unit) => unit.code), example: 'kg' })
  @IsDefined()
  @IsWeightUnit()
  unit!: string;
}

export class WorkoutEntryInputDto {
  @ApiProperty({ example: 'Bench Press', description: 'Catalog name or alias, case-insensitive.' })
  @IsDefined()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'exerciseName must not be blank', context: { code: 'BLANK' } })
  exerciseName!: string;

  @ApiProperty({
    example: '2026-10-01T18:30:00+07:00',
    description:
      'ISO-8601 datetime with an offset (Z or ±hh:mm), or a date-only YYYY-MM-DD read as local midnight in `timezone`.',
  })
  @IsDefined()
  @IsString()
  date!: string;

  @ApiProperty({ type: [WorkoutSetInputDto], minItems: 1, maxItems: MAX_SETS_PER_ENTRY })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SETS_PER_ENTRY)
  @ValidateNested({ each: true })
  @Type(() => WorkoutSetInputDto)
  sets!: WorkoutSetInputDto[];
}

export class CreateWorkoutsDto {
  @ApiPropertyOptional({
    example: 'Asia/Ho_Chi_Minh',
    description: 'IANA time zone. Required when an entry uses a date-only `date` (decision M4-A1).',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ type: [WorkoutEntryInputDto], minItems: 1, maxItems: MAX_ENTRIES_PER_REQUEST })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => WorkoutEntryInputDto)
  entries!: WorkoutEntryInputDto[];
}

export class UserParamsDto {
  @ApiProperty({ example: 'client-42', pattern: '^[A-Za-z0-9_-]{1,64}$' })
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    message: 'userId must be 1-64 characters: letters, digits, underscore or hyphen',
  })
  userId!: string;
}
