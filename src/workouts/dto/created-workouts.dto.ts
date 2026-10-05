import { ApiProperty } from '@nestjs/swagger';

export class CreatedSetDto {
  @ApiProperty({ example: 2 }) setNumber!: number;
  @ApiProperty({ example: 8 }) reps!: number;
  @ApiProperty({ example: 185, description: 'As entered' }) weight!: number;
  @ApiProperty({ example: 'lb', description: 'As entered' }) unit!: string;
  @ApiProperty({ example: 83.91, description: 'Normalized, rounded to 2 decimals' })
  weightKg!: number;
}

export class ExerciseSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Bench Press' }) name!: string;
}

export class CreatedEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ExerciseSummaryDto }) exercise!: ExerciseSummaryDto;
  @ApiProperty({ example: '2026-10-01T11:30:00.000Z', description: 'UTC instant' })
  performedAt!: string;
  @ApiProperty({
    example: '2026-10-01',
    description: 'Calendar date at the offset it was logged with',
  })
  localDate!: string;
  @ApiProperty({ example: 420 }) utcOffsetMinutes!: number;
  @ApiProperty({ type: [CreatedSetDto] }) sets!: CreatedSetDto[];
}

export class CreatedEntriesDataDto {
  @ApiProperty({ type: [CreatedEntryDto] }) entries!: CreatedEntryDto[];
}

export class CreatedWorkoutsMetaDto {
  @ApiProperty({ example: 2 }) created!: number;
}

export class CreatedWorkoutsResponseDto {
  @ApiProperty({ type: CreatedEntriesDataDto }) data!: CreatedEntriesDataDto;
  @ApiProperty({ type: CreatedWorkoutsMetaDto }) meta!: CreatedWorkoutsMetaDto;
}
