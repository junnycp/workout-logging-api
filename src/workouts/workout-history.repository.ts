import { Injectable } from '@nestjs/common';
import type { CursorPosition } from '../common/pagination/cursor';
import type { InstantRange } from '../common/time/time';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

export interface HistoryPageQuery {
  userId: string;
  /** Undefined: every exercise. Otherwise a non-empty list of exercise ids. */
  exerciseIds?: string[];
  range: InstantRange;
  after?: CursorPosition;
  take: number;
}

export interface HistoryEntryRow {
  id: string;
  exerciseId: string;
  performedAt: Date;
  utcOffsetMinutes: number;
}

export interface HistorySetRow {
  entryId: string;
  setNumber: number;
  reps: number;
  /** Decimal string, as logged. */
  weight: string;
  unit: string;
}

@Injectable()
export class WorkoutHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of entries, newest first, ordered by (performed_at DESC, id DESC) and continued after the
   * cursor with a row comparison, so the cost does not grow with page depth (Prisma's own cursor does).
   * - Without an exercise filter: an index scan of (user_id, performed_at DESC, id DESC).
   * - With exercise ids (decision M5-A): for each id, the newest `take` rows from
   *   (user_id, exercise_id, performed_at DESC, id DESC), then the newest `take` of those. The work is at
   *   most ids x take index rows however the user's data is distributed; `exercise_id = ANY(...)` instead
   *   made the planner skip ~21k rows when the matching exercise was only logged long ago (M5 spike).
   */
  async findPage(query: HistoryPageQuery): Promise<HistoryEntryRow[]> {
    const conditions = [Prisma.sql`e.user_id = ${query.userId}`];
    if (query.range.gte)
      conditions.push(Prisma.sql`e.performed_at >= ${query.range.gte}::timestamptz`);
    if (query.range.lt)
      conditions.push(Prisma.sql`e.performed_at < ${query.range.lt}::timestamptz`);
    if (query.after) {
      conditions.push(
        Prisma.sql`(e.performed_at, e.id) < (${query.after.performedAt}::timestamptz, ${query.after.id}::uuid)`,
      );
    }
    const columns = Prisma.sql`e.id, e.exercise_id AS "exerciseId", e.performed_at AS "performedAt",
      e.utc_offset_minutes AS "utcOffsetMinutes"`;

    if (query.exerciseIds === undefined) {
      return this.prisma.$queryRaw<HistoryEntryRow[]>`
        SELECT ${columns}
        FROM workout_entries e
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY e.performed_at DESC, e.id DESC
        LIMIT ${query.take}`;
    }
    return this.prisma.$queryRaw<HistoryEntryRow[]>`
      SELECT p.*
      FROM unnest(${query.exerciseIds}::uuid[]) AS x(exercise_id)
      CROSS JOIN LATERAL (
        SELECT ${columns}
        FROM workout_entries e
        WHERE e.exercise_id = x.exercise_id AND ${Prisma.join(conditions, ' AND ')}
        ORDER BY e.performed_at DESC, e.id DESC
        LIMIT ${query.take}
      ) p
      ORDER BY p."performedAt" DESC, p.id DESC
      LIMIT ${query.take}`;
  }

  /** Sets of the given entries in set order; one query on the (entry_id, set_number) unique index. */
  async findSets(entryIds: string[]): Promise<HistorySetRow[]> {
    const rows = await this.prisma.workoutSet.findMany({
      where: { entryId: { in: entryIds } },
      select: { entryId: true, setNumber: true, reps: true, weight: true, unit: true },
      orderBy: [{ entryId: 'asc' }, { setNumber: 'asc' }],
    });
    return rows.map((row) => ({ ...row, weight: row.weight.toString() }));
  }
}
