import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { InstantRange } from '../common/time/time';
import { PrismaService } from '../database/prisma.service';
import type { RecordMetric } from './domain/record-metrics';

/** Stored column that ranks each record. 4-decimal kg: it can tie sets whose exact values differ. */
const RANK_COLUMN = {
  maxWeight: 'weightKg',
  maxVolume: 'volumeKg',
  bestEstimated1RM: 'e1rmKg',
} as const satisfies Record<RecordMetric, string>;

/** Rows read per record; ties beyond this on the top stored value are fetched by a second query. */
const RECORD_CANDIDATES = 50;

export interface RecordScope {
  userId: string;
  exerciseId: string;
  range: InstantRange;
}

export interface RecordSetRow {
  id: string;
  entryId: string;
  setNumber: number;
  reps: number;
  /** As logged, in `unit`. */
  weight: Decimal;
  unit: string;
  performedAt: Date;
  utcOffsetMinutes: number;
}

@Injectable()
export class PersonalRecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ids of the sets tied on the highest stored value of one metric, the only sets that can hold the record
   * (rounding to 4 decimals is monotonic); `pickRecord` then settles them on exact values. Usually one
   * Index Only Scan of `workout_sets_pr_covering_idx` reading the top 50 (decision D10); only when all 50
   * tie, a second query fetches every tied set. Weight 0 (bodyweight) never counts.
   */
  async findRecordCandidates(scope: RecordScope, metric: RecordMetric): Promise<string[]> {
    const column = RANK_COLUMN[metric];
    const where = { ...this.where(scope), weightKg: { gt: 0 } };
    const rows = await this.prisma.workoutSet.findMany({
      where,
      orderBy: [{ [column]: 'desc' }, { reps: 'desc' }, { performedAt: 'asc' }, { id: 'asc' }],
      take: RECORD_CANDIDATES,
      select: { id: true, weightKg: true, volumeKg: true, e1rmKg: true },
    });
    const top = rows[0]?.[column];
    if (top === undefined) return [];
    const tied = rows.filter((row) => row[column].equals(top));
    if (tied.length < RECORD_CANDIDATES) return tied.map((row) => row.id);
    const all = await this.prisma.workoutSet.findMany({
      where: { ...where, [column]: top },
      select: { id: true },
    });
    return all.map((row) => row.id);
  }

  /** Whether the scope has bodyweight sets (weight 0), to explain why there are no records. */
  async hasBodyweightSets(scope: RecordScope): Promise<boolean> {
    const row = await this.prisma.workoutSet.findFirst({
      where: { ...this.where(scope), weightKg: 0 },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Details of the candidate sets of every record in a request: two statements (sets, then their entries'
   * offsets), more when Prisma splits a very long id list into chunks (thousands of tied candidates).
   */
  async findSets(ids: string[]): Promise<Map<string, RecordSetRow>> {
    const rows = await this.prisma.workoutSet.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        entryId: true,
        setNumber: true,
        reps: true,
        weight: true,
        unit: true,
        performedAt: true,
        entry: { select: { utcOffsetMinutes: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          entryId: row.entryId,
          setNumber: row.setNumber,
          reps: row.reps,
          weight: new Decimal(row.weight.toString()),
          unit: row.unit,
          performedAt: row.performedAt,
          utcOffsetMinutes: row.entry.utcOffsetMinutes,
        },
      ]),
    );
  }

  private where({ userId, exerciseId, range }: RecordScope) {
    return {
      userId,
      exerciseId,
      ...(range.gte || range.lt ? { performedAt: { gte: range.gte, lt: range.lt } } : {}),
    };
  }
}
