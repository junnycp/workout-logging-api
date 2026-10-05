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

export type InsertOutcome = 'inserted' | 'idempotency-key-taken';

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
   * Entries, sets and (optionally) the idempotency record in one transaction, with a constant number of
   * statements whatever the batch size. The record is written last (decision M4-B1): if a concurrent
   * request already committed the same key, the primary key rejects it, everything here is rolled back
   * and the caller replays the stored response.
   */
  async insertWorkouts(
    entries: NewEntry[],
    sets: NewSet[],
    idempotency?: IdempotencyRecord,
  ): Promise<InsertOutcome> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.workoutEntry.createMany({ data: entries });
        await tx.workoutSet.createMany({ data: sets });
        if (idempotency) {
          await tx.idempotencyKey.create({
            data: {
              userId: idempotency.userId,
              key: idempotency.key,
              requestHash: idempotency.requestHash,
              responseStatus: idempotency.status,
              responseBody: idempotency.body as Prisma.InputJsonValue,
            },
          });
        }
      });
      return 'inserted';
    } catch (error) {
      const uniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (idempotency && uniqueViolation) {
        // Only the idempotency key can collide (ids are fresh UUIDv7); confirm before treating it so.
        const existing = await this.findStoredResponse(idempotency.userId, idempotency.key);
        if (existing) return 'idempotency-key-taken';
      }
      throw error;
    }
  }
}
