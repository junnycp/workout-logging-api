import { HttpStatus, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode, ErrorDetail } from '../common/errors/error-codes';
import { CursorPosition, decodeCursor, encodeCursor } from '../common/pagination/cursor';
import {
  canonicalTimeZone,
  InstantRange,
  localDateOf,
  resolveDateRange,
} from '../common/time/time';
import { ExerciseDetails, ExerciseLookupService } from '../exercises/exercise-lookup.service';
import { weightUnits } from '../units/weight-units';
import { roundForResponse } from './domain/set-metrics';
import {
  HistoryEntryDto,
  HistorySetDto,
  WorkoutHistoryQueryDto,
  WorkoutHistoryResponseDto,
} from './dto/workout-history.dto';
import { HistorySetRow, WorkoutHistoryRepository } from './workout-history.repository';

export const EMPTY_HISTORY_MESSAGE = 'No workouts found for the given filters.';

const RANGE_MESSAGES = {
  INVALID_DATE: 'must be YYYY-MM-DD or an ISO-8601 datetime with an offset',
  MISSING_OFFSET: 'has a time but no UTC offset; add Z or ±hh:mm',
} as const;

@Injectable()
export class WorkoutHistoryService {
  constructor(
    private readonly repository: WorkoutHistoryRepository,
    private readonly exercises: ExerciseLookupService,
  ) {}

  async history(userId: string, query: WorkoutHistoryQueryDto): Promise<WorkoutHistoryResponseDto> {
    const { timezone, range, after } = this.parseQuery(query);
    const meta = { limit: query.limit, unit: query.unit ?? null, timezone };
    const empty = (): WorkoutHistoryResponseDto => ({
      data: [],
      meta: { ...meta, hasMore: false, nextCursor: null, message: EMPTY_HISTORY_MESSAGE },
    });

    const exerciseIds = await this.exerciseFilter(query);
    if (exerciseIds?.length === 0) return empty();

    const rows = await this.repository.findPage({
      userId,
      exerciseIds,
      range,
      after,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    if (page.length === 0) return empty();

    const [sets, exercises] = await Promise.all([
      this.repository.findSets(page.map((row) => row.id)),
      this.exercises.describe(page.map((row) => row.exerciseId)),
    ]);
    const setsByEntry = new Map<string, HistorySetRow[]>();
    for (const set of sets) {
      setsByEntry.set(set.entryId, [...(setsByEntry.get(set.entryId) ?? []), set]);
    }

    const data: HistoryEntryDto[] = page.map((row) => ({
      id: row.id,
      performedAt: row.performedAt.toISOString(),
      localDate: localDateOf(row.performedAt, row.utcOffsetMinutes),
      utcOffsetMinutes: row.utcOffsetMinutes,
      exercise: exercises.get(row.exerciseId) as ExerciseDetails,
      sets: (setsByEntry.get(row.id) ?? []).map((set) => presentSet(set, query.unit)),
    }));
    const last = page[page.length - 1] as (typeof page)[number];
    return {
      data,
      meta: {
        ...meta,
        hasMore,
        nextCursor: hasMore ? encodeCursor({ performedAt: last.performedAt, id: last.id }) : null,
      },
    };
  }

  /** Every query problem is reported in one 400, except a bad cursor or an inverted range. */
  private parseQuery(query: WorkoutHistoryQueryDto): {
    timezone: string;
    range: InstantRange;
    after?: CursorPosition;
  } {
    const details: ErrorDetail[] = [];
    const timezone = canonicalTimeZone(query.tz ?? 'UTC');
    if (timezone === null) {
      details.push({
        path: 'tz',
        code: 'INVALID_TIMEZONE',
        message: 'tz is not a valid IANA time zone',
      });
    } else {
      for (const bound of ['from', 'to'] as const) {
        const value = query[bound];
        if (value === undefined) continue;
        const parsed = resolveDateRange({ [bound]: value }, timezone);
        if (!parsed.ok && (parsed.error === 'INVALID_DATE' || parsed.error === 'MISSING_OFFSET')) {
          details.push({
            path: bound,
            code: parsed.error,
            message: `${bound} ${RANGE_MESSAGES[parsed.error]}`,
          });
        }
      }
    }
    if (details.length > 0 || timezone === null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        details,
      );
    }

    const range = resolveDateRange({ from: query.from, to: query.to }, timezone);
    if (!range.ok) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_DATE_RANGE,
        '`from` must not be after `to`',
      );
    }

    let after: CursorPosition | undefined;
    if (query.cursor !== undefined) {
      after = decodeCursor(query.cursor) ?? undefined;
      if (!after) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.INVALID_CURSOR,
          'cursor is not valid; use meta.nextCursor from a previous page',
        );
      }
    }
    return { timezone, range: range.value, after };
  }

  /**
   * Exercise ids allowed by the `exercise` and `muscleGroup` filters (their intersection), or undefined
   * when neither is given. An unknown muscle group is an error; a name that matches nothing is not.
   */
  private async exerciseFilter(query: WorkoutHistoryQueryDto): Promise<string[] | undefined> {
    const [byName, byMuscle] = await Promise.all([
      query.exercise === undefined ? undefined : this.exercises.matchIdsByName(query.exercise),
      query.muscleGroup === undefined
        ? undefined
        : this.exercises.exerciseIdsForMuscleGroup(query.muscleGroup),
    ]);
    if (byMuscle === null) {
      const codes = await this.exercises.muscleGroupCodes();
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.UNKNOWN_MUSCLE_GROUP,
        `Unknown muscle group '${query.muscleGroup}'. Valid: ${codes.join(', ')}`,
      );
    }
    if (byName === undefined) return byMuscle;
    if (byMuscle === undefined) return byName;
    const muscle = new Set(byMuscle);
    return byName.filter((id) => muscle.has(id));
  }
}

/**
 * A set in the requested unit (rule C16): converted from the value as logged and rounded once; in its
 * own unit it is returned exactly as logged. The stored 4-decimal kg is never rounded again.
 */
function presentSet(set: HistorySetRow, unit: string | undefined): HistorySetDto {
  const target = unit ?? set.unit;
  const weight = new Decimal(set.weight);
  return {
    setNumber: set.setNumber,
    reps: set.reps,
    weight:
      target === set.unit
        ? weight.toNumber()
        : roundForResponse(weightUnits.convert(weight, set.unit, target)),
    unit: target,
  };
}
