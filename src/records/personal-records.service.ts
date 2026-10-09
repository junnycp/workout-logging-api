import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception';
import { DetailCode, ErrorCode, ErrorDetail } from '../common/errors/error-codes';
import { CLOCK, Clock } from '../common/time/clock';
import { parseRangeQuery } from '../common/time/range-query';
import { InstantRange, localDateOf, periodRanges } from '../common/time/time';
import { ExerciseCatalogRepository, ExerciseRef } from '../exercises/exercise-catalog.repository';
import { normalizeExerciseName } from '../exercises/exercise-name';
import { weightUnits } from '../units/weight-units';
import { roundForResponse } from '../workouts/domain/set-metrics';
import {
  compareRecords,
  pickRecord,
  RECORD_METRICS,
  RecordMetric,
  recordValue,
} from './domain/record-metrics';
import {
  CompareRecordsQueryDto,
  CompareRecordsResponseDto,
  PersonalRecordDto,
  PersonalRecordsQueryDto,
  PersonalRecordsResponseDto,
} from './dto/personal-records.dto';
import {
  PersonalRecordsRepository,
  RecordScope,
  RecordSetRow,
} from './personal-records.repository';

export const NO_SETS_MESSAGE = 'No weighted sets found for this exercise in the given range.';
export const ONLY_BODYWEIGHT_MESSAGE =
  'Only bodyweight sets were logged in the given range; weighted records need a weight above 0.';
export const NO_SETS_IN_EITHER_PERIOD_MESSAGE =
  'No weighted sets found for this exercise in either period.';
const DEFAULT_UNIT = 'kg';
const EXPLICIT_BOUNDS = ['currentFrom', 'currentTo', 'previousFrom', 'previousTo'] as const;

type CandidateIds = Record<RecordMetric, string[]>;
type Winners = Record<RecordMetric, RecordSetRow | null>;

@Injectable()
export class PersonalRecordsService {
  constructor(
    private readonly repository: PersonalRecordsRepository,
    private readonly exercises: ExerciseCatalogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async records(
    userId: string,
    query: PersonalRecordsQueryDto,
  ): Promise<PersonalRecordsResponseDto> {
    const {
      timezone,
      ranges: [range],
    } = parseRangeQuery(query.tz, [
      { from: query.from, to: query.to, fromPath: 'from', toPath: 'to' },
    ]);
    const exercise = await this.resolveExercise(query.exercise);
    const unit = query.unit ?? DEFAULT_UNIT;
    const scope: RecordScope = { userId, exerciseId: exercise.id, range: range as InstantRange };

    const ids = await this.candidateIds(scope);
    const sets = await this.repository.findSets(Object.values(ids).flat());
    const winners = winnersOf(ids, sets);
    const empty = RECORD_METRICS.every((metric) => winners[metric] === null);
    const message =
      empty && (await this.repository.hasBodyweightSets(scope))
        ? ONLY_BODYWEIGHT_MESSAGE
        : NO_SETS_MESSAGE;

    return {
      data: {
        exercise,
        unit,
        range: { ...inclusiveBounds(scope.range), timezone },
        ...presentAll(winners, unit),
      },
      meta: empty ? { message } : {},
    };
  }

  async compare(userId: string, query: CompareRecordsQueryDto): Promise<CompareRecordsResponseDto> {
    const { timezone, current, previous } = this.comparisonRanges(query);
    const exercise = await this.resolveExercise(query.exercise);
    const unit = query.unit ?? DEFAULT_UNIT;
    const scopeOf = (range: InstantRange): RecordScope => ({
      userId,
      exerciseId: exercise.id,
      range,
    });

    // One period after the other: at most three pool connections per request.
    const currentIds = await this.candidateIds(scopeOf(current));
    const previousIds = await this.candidateIds(scopeOf(previous));
    const sets = await this.repository.findSets([
      ...Object.values(currentIds).flat(),
      ...Object.values(previousIds).flat(),
    ]);
    const currentWinners = winnersOf(currentIds, sets);
    const previousWinners = winnersOf(previousIds, sets);
    const exact = (winners: Winners, metric: RecordMetric) => {
      const set = winners[metric];
      return set && recordValue(metric, set, unit);
    };
    const delta = byMetric((metric) =>
      compareRecords(exact(currentWinners, metric), exact(previousWinners, metric)),
    );
    const empty = RECORD_METRICS.every(
      (metric) => currentWinners[metric] === null && previousWinners[metric] === null,
    );

    return {
      data: {
        exercise,
        unit,
        timezone,
        current: { ...requiredBounds(current), ...presentAll(currentWinners, unit) },
        previous: { ...requiredBounds(previous), ...presentAll(previousWinners, unit) },
        delta,
      },
      meta: empty ? { message: NO_SETS_IN_EITHER_PERIOD_MESSAGE } : {},
    };
  }

  /** Either `period` (now from the injected clock) or all four explicit bounds, never both. */
  private comparisonRanges(query: CompareRecordsQueryDto): {
    timezone: string;
    current: Required<InstantRange>;
    previous: Required<InstantRange>;
  } {
    const given = EXPLICIT_BOUNDS.filter((bound) => query[bound] !== undefined);
    const details: ErrorDetail[] = [];
    if (query.period !== undefined && given.length > 0) {
      details.push({
        path: 'period',
        code: DetailCode.CONFLICT,
        message: `Use either period or ${EXPLICIT_BOUNDS.join('/')}, not both`,
      });
    } else if (query.period === undefined && given.length === 0) {
      details.push({
        path: 'period',
        code: DetailCode.REQUIRED,
        message: `Send period (week, month or year) or all of ${EXPLICIT_BOUNDS.join(', ')}`,
      });
    } else if (query.period === undefined) {
      for (const bound of EXPLICIT_BOUNDS.filter((b) => query[b] === undefined)) {
        details.push({
          path: bound,
          code: DetailCode.REQUIRED,
          message: `${bound} is required when comparing explicit ranges`,
        });
      }
    }
    if (details.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        details,
      );
    }

    if (query.period !== undefined) {
      const { timezone } = parseRangeQuery(query.tz, []);
      return { timezone, ...periodRanges(query.period, this.clock.now(), timezone) };
    }
    const {
      timezone,
      ranges: [current, previous],
    } = parseRangeQuery(query.tz, [
      {
        from: query.currentFrom,
        to: query.currentTo,
        fromPath: 'currentFrom',
        toPath: 'currentTo',
      },
      {
        from: query.previousFrom,
        to: query.previousTo,
        fromPath: 'previousFrom',
        toPath: 'previousTo',
      },
    ]);
    // All four bounds are present, so both ranges are closed.
    return {
      timezone,
      current: current as Required<InstantRange>,
      previous: previous as Required<InstantRange>,
    };
  }

  /** Closed catalog (D5): an unknown name is a 400 with "did you mean" suggestions, as on POST. */
  private async resolveExercise(name: string): Promise<ExerciseRef> {
    const key = normalizeExerciseName(name);
    const exercise = (await this.exercises.resolve([key])).get(key);
    if (exercise) return exercise;
    const suggestions = (await this.exercises.suggest([key])).get(key) ?? [];
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      [
        {
          path: 'exercise',
          code: DetailCode.UNKNOWN_EXERCISE,
          message: `Unknown exercise '${name}'`,
          suggestions,
        },
      ],
    );
  }

  private async candidateIds(scope: RecordScope): Promise<CandidateIds> {
    const [maxWeight, maxVolume, bestEstimated1RM] = await Promise.all(
      RECORD_METRICS.map((metric) => this.repository.findRecordCandidates(scope, metric)),
    );
    return {
      maxWeight: maxWeight ?? [],
      maxVolume: maxVolume ?? [],
      bestEstimated1RM: bestEstimated1RM ?? [],
    };
  }
}

/** Builds { maxWeight, maxVolume, bestEstimated1RM } with one value per metric. */
function byMetric<T>(value: (metric: RecordMetric) => T): Record<RecordMetric, T> {
  return {
    maxWeight: value('maxWeight'),
    maxVolume: value('maxVolume'),
    bestEstimated1RM: value('bestEstimated1RM'),
  };
}

/** Settles each record among its candidates on exact values (D4, rule C16). */
const winnersOf = (ids: CandidateIds, sets: Map<string, RecordSetRow>): Winners =>
  byMetric((metric) =>
    pickRecord(
      metric,
      ids[metric].map((id) => {
        const set = sets.get(id);
        if (!set) throw new Error(`Record set ${id} disappeared between queries`);
        return set;
      }),
    ),
  );

const presentAll = (winners: Winners, unit: string) =>
  byMetric((metric) => {
    const set = winners[metric];
    return set && presentRecord(metric, set, unit);
  });

/** Rounded once from the set as logged (rule C16); a weight in its own unit is returned as logged. */
function presentRecord(metric: RecordMetric, set: RecordSetRow, unit: string): PersonalRecordDto {
  return {
    value: roundForResponse(recordValue(metric, set, unit)),
    set: {
      reps: set.reps,
      weight:
        unit === set.unit
          ? set.weight.toNumber()
          : roundForResponse(weightUnits.convert(set.weight, set.unit, unit)),
    },
    achievedAt: set.performedAt.toISOString(),
    localDate: localDateOf(set.performedAt, set.utcOffsetMinutes),
    entryId: set.entryId,
    setNumber: set.setNumber,
  };
}

/** Half-open [gte, lt) as the inclusive instants clients sent or would expect (lt - 1 ms). */
const inclusiveBounds = (range: InstantRange) => ({
  from: range.gte?.toISOString() ?? null,
  to: range.lt ? new Date(range.lt.getTime() - 1).toISOString() : null,
});

const requiredBounds = (range: Required<InstantRange>) => ({
  from: range.gte.toISOString(),
  to: new Date(range.lt.getTime() - 1).toISOString(),
});
