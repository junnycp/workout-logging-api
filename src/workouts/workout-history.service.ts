import { HttpStatus, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CursorPosition, decodeCursor, encodeCursor } from '../common/pagination/cursor';
import { parseRangeQuery } from '../common/time/range-query';
import { InstantRange, localDateOf } from '../common/time/time';
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
      const list = setsByEntry.get(set.entryId);
      if (list) list.push(set);
      else setsByEntry.set(set.entryId, [set]);
    }

    const data: HistoryEntryDto[] = page.map((row) => ({
      id: row.id,
      performedAt: row.performedAt.toISOString(),
      localDate: localDateOf(row.performedAt, row.utcOffsetMinutes),
      utcOffsetMinutes: row.utcOffsetMinutes,
      exercise: exerciseOf(exercises, row.exerciseId),
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

  /** Zone and range problems are reported in one 400 (see parseRangeQuery); then the cursor. */
  private parseQuery(query: WorkoutHistoryQueryDto): {
    timezone: string;
    range: InstantRange;
    after?: CursorPosition;
  } {
    const {
      timezone,
      ranges: [range],
    } = parseRangeQuery(query.tz, [
      { from: query.from, to: query.to, fromPath: 'from', toPath: 'to' },
    ]);

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
    return { timezone, range: range as InstantRange, after };
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
        : this.exercises.exerciseIdsForMuscleGroup(query.muscleGroup.trim().toLowerCase()),
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

/** Entries reference exercises by FK, so a miss means a broken invariant: fail loudly, not `undefined`. */
function exerciseOf(exercises: Map<string, ExerciseDetails>, id: string): ExerciseDetails {
  const exercise = exercises.get(id);
  if (!exercise) throw new Error(`Exercise ${id} referenced by a workout entry was not found`);
  return exercise;
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
