import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { InstantRange } from '../common/time/time';
import { PrismaService } from '../database/prisma.service';
import type { RecordMetric } from './domain/record-metrics';

/** Stored column that ranks each record (4-decimal kg; rounding is monotonic, so it can only create ties). */
const RANK_COLUMN = {
  maxWeight: 'weightKg',
  maxVolume: 'volumeKg',
  bestEstimated1RM: 'e1rmKg',
} as const satisfies Record<RecordMetric, string>;

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
   * Id of the set holding one record, or null. Tie-break (D4): higher value, more reps, earliest
   * performed_at, lowest set id. Weight 0 (bodyweight) never counts. Selecting only indexed columns keeps
   * this an Index Only Scan of `workout_sets_pr_covering_idx` (decision D10).
   */
  async findRecordSetId(scope: RecordScope, metric: RecordMetric): Promise<string | null> {
    const row = await this.prisma.workoutSet.findFirst({
      where: { ...this.where(scope), weightKg: { gt: 0 } },
      orderBy: [
        { [RANK_COLUMN[metric]]: 'desc' },
        { reps: 'desc' },
        { performedAt: 'asc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Whether the scope has bodyweight sets (weight 0), to explain why there are no records. */
  async hasBodyweightSets(scope: RecordScope): Promise<boolean> {
    const row = await this.prisma.workoutSet.findFirst({
      where: { ...this.where(scope), weightKg: 0 },
      select: { id: true },
    });
    return row !== null;
  }

  /** Details of the winning sets (at most six per request); one query. */
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
