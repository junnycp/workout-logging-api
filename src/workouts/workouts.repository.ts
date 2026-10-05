import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

export interface NewEntry {
  id: string;
  userId: string;
  exerciseId: string;
  performedAt: Date;
  utcOffsetMinutes: number;
}

export interface NewSet {
  id: string;
  entryId: string;
  setNumber: number;
  reps: number;
  /** Decimal strings, already at storage scale. */
  weight: string;
  unit: string;
  weightKg: string;
  volumeKg: string;
  e1rmKg: string;
  userId: string;
  exerciseId: string;
  performedAt: Date;
}

export interface StoredResponse {
  requestHash: string;
  status: number;
  body: unknown;
}

export interface IdempotencyRecord extends StoredResponse {
  userId: string;
  key: string;
}

export type InsertOutcome =
  | { kind: 'inserted' }
  /** A concurrent request committed the same key first; this insert was rolled back. */
  | { kind: 'idempotency-key-taken'; stored: StoredResponse };

@Injectable()
export class WorkoutsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStoredResponse(userId: string, key: string): Promise<StoredResponse | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
      select: { requestHash: true, responseStatus: true, responseBody: true },
    });
    return (
      row && { requestHash: row.requestHash, status: row.responseStatus, body: row.responseBody }
    );
  }

  /**
   * Entries, sets and (optionally) the idempotency record in one transaction. A batch (array) transaction:
   * the writes do not depend on each other, so no connection is held across application code. Prisma
   * splits a large createMany by its bind-parameter limit, so the statement count grows only with the
   * payload size (a 100 x 50 request binds 60,000 values for the sets).
   * The idempotency record is written last (decision M4-B1): if a concurrent request already committed the
   * same key, the primary key rejects it, everything here is rolled back and the stored response is
   * returned for replay.
   */
  async insertWorkouts(
    entries: NewEntry[],
    sets: NewSet[],
    idempotency?: IdempotencyRecord,
  ): Promise<InsertOutcome> {
    try {
      await this.prisma.$transaction([
        this.prisma.workoutEntry.createMany({ data: entries }),
        this.prisma.workoutSet.createMany({ data: sets }),
        ...(idempotency
          ? [
              this.prisma.idempotencyKey.create({
                data: {
                  userId: idempotency.userId,
                  key: idempotency.key,
                  requestHash: idempotency.requestHash,
                  responseStatus: idempotency.status,
                  responseBody: idempotency.body as Prisma.InputJsonValue,
                },
              }),
            ]
          : []),
      ]);
      return { kind: 'inserted' };
    } catch (error) {
      const uniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (idempotency && uniqueViolation) {
        // Only the idempotency key can collide (ids are fresh UUIDv7); confirm by reading it back.
        const stored = await this.findStoredResponse(idempotency.userId, idempotency.key);
        if (stored) return { kind: 'idempotency-key-taken', stored };
      }
      throw error;
    }
  }
}
