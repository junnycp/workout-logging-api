import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v7 as uuidv7 } from 'uuid';
import { AppException } from '../common/errors/app-exception';
import { DetailCode, ErrorCode, ErrorDetail } from '../common/errors/error-codes';
import { requestHash } from '../common/idempotency/request-hash';
import { CLOCK, Clock } from '../common/time/clock';
import {
  canonicalTimeZone,
  DateInputError,
  isTooFarInFuture,
  localDateOf,
  parseWorkoutDate,
} from '../common/time/time';
import { ExerciseCatalogRepository, ExerciseRef } from '../exercises/exercise-catalog.repository';
import { normalizeExerciseName } from '../exercises/exercise-name';
import { weightUnits } from '../units/weight-units';
import { computeSetMetrics, roundForResponse } from './domain/set-metrics';
import { CreateWorkoutsDto, WorkoutEntryInputDto } from './dto/create-workouts.dto';
import { CreatedEntryDto, CreatedWorkoutsResponseDto } from './dto/created-workouts.dto';
import { NewEntry, NewSet, StoredResponse, WorkoutsRepository } from './workouts.repository';

export interface LogWorkoutsResult {
  status: HttpStatus.CREATED | HttpStatus.OK;
  body: CreatedWorkoutsResponseDto;
  replayed: boolean;
}

const DATE_MESSAGES: Record<DateInputError, string> = {
  INVALID_DATE:
    'date must be YYYY-MM-DD or an ISO-8601 datetime with an offset, with a year between 1900 and 2100',
  MISSING_OFFSET:
    'date has a time but no UTC offset; add Z or ±hh:mm (e.g. 2026-10-01T18:30:00+07:00)',
  MISSING_TIMEZONE:
    'date has no time; send the request-level timezone (IANA, e.g. Asia/Ho_Chi_Minh)',
  INVALID_TIMEZONE: 'timezone is not a valid IANA time zone',
};
const DATE_IN_FUTURE_MESSAGE =
  'date is more than 24 hours in the future; log workouts after they happen';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

interface ResolvedEntry {
  input: WorkoutEntryInputDto;
  exercise: ExerciseRef;
  performedAt: Date;
  utcOffsetMinutes: number;
}

@Injectable()
export class WorkoutLoggingService {
  constructor(
    private readonly repository: WorkoutsRepository,
    private readonly exercises: ExerciseCatalogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Validates the request against the catalog and the date rules, then stores everything in one
   * transaction (all-or-nothing). With an Idempotency-Key, a retry of the same body replays the stored
   * response and a different body with the same key is rejected.
   */
  async logWorkouts(
    userId: string,
    dto: CreateWorkoutsDto,
    rawBody: unknown,
    idempotencyKey?: string,
  ): Promise<LogWorkoutsResult> {
    const hash = idempotencyKey === undefined ? undefined : requestHash(rawBody);
    if (idempotencyKey !== undefined && hash !== undefined) {
      const stored = await this.repository.findStoredResponse(userId, idempotencyKey);
      if (stored) return this.replay(stored, hash);
    }

    const resolved = await this.resolveEntries(dto);
    const { entries, sets, body } = this.buildRows(userId, resolved);

    const outcome = await this.repository.insertWorkouts(
      entries,
      sets,
      idempotencyKey !== undefined && hash !== undefined
        ? { userId, key: idempotencyKey, requestHash: hash, status: HttpStatus.CREATED, body }
        : undefined,
    );
    if (outcome.kind === 'idempotency-key-taken' && hash !== undefined) {
      // A concurrent request with the same key committed first; this one was rolled back.
      return this.replay(outcome.stored, hash);
    }
    return { status: HttpStatus.CREATED, body, replayed: false };
  }

  private replay(stored: StoredResponse, hash: string): LogWorkoutsResult {
    if (stored.requestHash !== hash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'This Idempotency-Key was already used with a different request body',
      );
    }
    return {
      status: HttpStatus.OK,
      body: stored.body as CreatedWorkoutsResponseDto,
      replayed: true,
    };
  }

  /** Semantic validation: every problem in every entry is reported in one 400 response. */
  private async resolveEntries(dto: CreateWorkoutsDto): Promise<ResolvedEntry[]> {
    const details: ErrorDetail[] = [];
    const now = this.clock.now();
    let timezone: string | undefined;
    let timezoneInvalid = false;
    if (dto.timezone !== undefined) {
      timezone = canonicalTimeZone(dto.timezone) ?? undefined;
      timezoneInvalid = timezone === undefined;
      if (timezoneInvalid) {
        details.push({
          path: 'timezone',
          code: DetailCode.INVALID_TIMEZONE,
          message: DATE_MESSAGES.INVALID_TIMEZONE,
        });
      }
    }

    const nameKeys = dto.entries.map((entry) => normalizeExerciseName(entry.exerciseName));
    const known = await this.exercises.resolve(nameKeys);
    const unknownKeys = nameKeys.filter((key) => !known.has(key));
    const suggestions = await this.exercises.suggest(unknownKeys);

    const resolved: ResolvedEntry[] = [];
    dto.entries.forEach((entry, index) => {
      const nameKey = nameKeys[index] as string;
      const exercise = known.get(nameKey);
      if (!exercise) {
        details.push({
          path: `entries[${index}].exerciseName`,
          code: DetailCode.UNKNOWN_EXERCISE,
          message: `Unknown exercise '${entry.exerciseName}'`,
          suggestions: suggestions.get(nameKey) ?? [],
        });
      }
      // A date-only value depends on the timezone; when that is invalid, it is reported once on `timezone`.
      if (timezoneInvalid && DATE_ONLY.test(entry.date)) return;
      const date = parseWorkoutDate(entry.date, timezone);
      if (!date.ok) {
        details.push({
          path: `entries[${index}].date`,
          code: date.error,
          message: DATE_MESSAGES[date.error],
        });
        return;
      }
      if (isTooFarInFuture(date.value.instant, now)) {
        details.push({
          path: `entries[${index}].date`,
          code: DetailCode.DATE_IN_FUTURE,
          message: DATE_IN_FUTURE_MESSAGE,
        });
        return;
      }
      if (exercise) resolved.push({ input: entry, exercise, ...toEntryTime(date.value) });
    });

    if (details.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        details,
      );
    }
    return resolved;
  }

  private buildRows(
    userId: string,
    resolved: ResolvedEntry[],
  ): { entries: NewEntry[]; sets: NewSet[]; body: CreatedWorkoutsResponseDto } {
    const entries: NewEntry[] = [];
    const sets: NewSet[] = [];
    const created: CreatedEntryDto[] = [];

    for (const { input, exercise, performedAt, utcOffsetMinutes } of resolved) {
      const entry: NewEntry = {
        id: uuidv7(),
        userId,
        exerciseId: exercise.id,
        performedAt,
        utcOffsetMinutes,
      };
      entries.push(entry);
      const createdSets = input.sets.map((set, index) => {
        const weight = new Decimal(set.weight);
        const metrics = computeSetMetrics({ reps: set.reps, weight, unit: set.unit });
        sets.push({
          id: uuidv7(),
          entryId: entry.id,
          setNumber: index + 1,
          reps: set.reps,
          weight: weight.toString(),
          unit: set.unit,
          ...metrics,
          userId,
          exerciseId: exercise.id,
          performedAt,
        });
        return {
          setNumber: index + 1,
          reps: set.reps,
          weight: set.weight,
          unit: set.unit,
          weightKg: roundForResponse(weightUnits.toKg(weight, set.unit)),
        };
      });
      created.push({
        id: entry.id,
        exercise,
        performedAt: performedAt.toISOString(),
        localDate: localDateOf(performedAt, utcOffsetMinutes),
        utcOffsetMinutes,
        sets: createdSets,
      });
    }
    return {
      entries,
      sets,
      body: { data: { entries: created }, meta: { created: created.length } },
    };
  }
}

const toEntryTime = (value: { instant: Date; utcOffsetMinutes: number }) => ({
  performedAt: value.instant,
  utcOffsetMinutes: value.utcOffsetMinutes,
});
