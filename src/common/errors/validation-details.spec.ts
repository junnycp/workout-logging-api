import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsString,
  Min,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { toErrorDetails } from './validation-details';

class SetDto {
  @IsInt() @Min(1) reps!: number;
  @IsIn(['kg', 'lb'], { context: { code: 'UNSUPPORTED_UNIT' } }) unit!: string;
}
class EntryDto {
  @IsString() exerciseName!: string;
  @ValidateNested({ each: true }) @Type(() => SetDto) @ArrayMinSize(1) sets!: SetDto[];
}
class BodyDto {
  @ValidateNested({ each: true }) @Type(() => EntryDto) entries!: EntryDto[];
}

const detailsFor = (body: unknown) =>
  toErrorDetails(
    validateSync(plainToInstance(BodyDto, body), { whitelist: true, forbidNonWhitelisted: true }),
  );

describe('toErrorDetails', () => {
  it('builds bracketed paths for nested array items', () => {
    const details = detailsFor({
      entries: [
        {
          exerciseName: 'Bench',
          sets: [
            { reps: 5, unit: 'kg' },
            { reps: 5, unit: 'stone' },
          ],
        },
      ],
    });
    expect(details).toEqual([
      expect.objectContaining({ path: 'entries[0].sets[1].unit', code: 'UNSUPPORTED_UNIT' }),
    ]);
  });

  it('emits one detail per failed constraint with an UPPER_SNAKE code', () => {
    const details = detailsFor({
      entries: [{ exerciseName: 'Bench', sets: [{ reps: 0.5, unit: 'kg' }] }],
    });
    expect(details.map((d) => [d.path, d.code])).toEqual(
      expect.arrayContaining([
        ['entries[0].sets[0].reps', 'IS_INT'],
        ['entries[0].sets[0].reps', 'MIN'],
      ]),
    );
  });

  it('reports a constraint on an array property at the property path', () => {
    const details = detailsFor({ entries: [{ exerciseName: 'Bench', sets: [] }] });
    expect(details).toEqual([
      expect.objectContaining({ path: 'entries[0].sets', code: 'ARRAY_MIN_SIZE' }),
    ]);
  });

  it('maps forbidden extra properties to UNKNOWN_FIELD', () => {
    const details = detailsFor({ entries: [], hacker: true });
    expect(details).toEqual([expect.objectContaining({ path: 'hacker', code: 'UNKNOWN_FIELD' })]);
  });

  it('keeps the human-readable class-validator message', () => {
    const [detail] = detailsFor({
      entries: [{ exerciseName: 42, sets: [{ reps: 1, unit: 'kg' }] }],
    });
    expect(detail?.message).toBe('exerciseName must be a string');
  });
});
