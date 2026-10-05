import { Injectable } from '@nestjs/common';
import { escapeLikePattern } from '../common/text/like-pattern';
import { PrismaService } from '../database/prisma.service';
import { normalizeExerciseName } from './exercise-name';

export interface ExerciseRef {
  id: string;
  name: string;
}

export type MuscleRole = 'primary' | 'secondary';

export interface ExerciseDetails extends ExerciseRef {
  /** Primary groups first, then secondary; alphabetical within a role. */
  muscleGroups: { code: string; role: MuscleRole }[];
}

const MAX_SUGGESTIONS = 3;

/** Resolves user-supplied exercise names against the closed catalog (D5). */
@Injectable()
export class ExerciseLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exact lookup by normalized name or alias; one query for the whole request. */
  async resolve(nameKeys: string[]): Promise<Map<string, ExerciseRef>> {
    const rows = await this.prisma.exerciseName.findMany({
      where: { nameKey: { in: [...new Set(nameKeys)] } },
      select: { nameKey: true, exercise: { select: { id: true, name: true } } },
    });
    return new Map(rows.map((row) => [row.nameKey, row.exercise]));
  }

  /**
   * Up to three canonical names per unknown key, most similar first (pg_trgm `%`, default threshold 0.3,
   * served by the trigram index). One query for all unknown names.
   */
  async suggest(nameKeys: string[]): Promise<Map<string, string[]>> {
    const keys = [...new Set(nameKeys)];
    if (keys.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ key: string; name: string }[]>`
      SELECT q.key, s.name
      FROM unnest(${keys}::text[]) AS q(key)
      CROSS JOIN LATERAL (
        SELECT e.name, max(similarity(n.name_key, q.key)) AS score
        FROM exercise_names n
        JOIN exercises e ON e.id = n.exercise_id
        WHERE n.name_key % q.key
        GROUP BY e.name
        ORDER BY score DESC, e.name
        LIMIT ${MAX_SUGGESTIONS}
      ) s`;
    const suggestions = new Map<string, string[]>(keys.map((key) => [key, []]));
    for (const row of rows) suggestions.get(row.key)?.push(row.name);
    return suggestions;
  }

  /**
   * Ids of the exercises whose canonical name or alias contains `term` (normalized like names, matched
   * literally). Partial matching for history filters; the trigram index serves it once the catalog grows.
   */
  async matchIdsByName(term: string): Promise<string[]> {
    const rows = await this.prisma.exerciseName.findMany({
      where: { nameKey: { contains: escapeLikePattern(normalizeExerciseName(term)) } },
      select: { exerciseId: true },
      distinct: ['exerciseId'],
    });
    return rows.map((row) => row.exerciseId);
  }

  /** Ids of the exercises mapped to a muscle group (any role), or null when the group does not exist. */
  async exerciseIdsForMuscleGroup(code: string): Promise<string[] | null> {
    const group = await this.prisma.muscleGroup.findUnique({
      where: { code },
      select: { exercises: { select: { exerciseId: true } } },
    });
    return group && group.exercises.map((mapping) => mapping.exerciseId);
  }

  async muscleGroupCodes(): Promise<string[]> {
    const rows = await this.prisma.muscleGroup.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => row.code);
  }

  /** Names and muscle groups for the exercises on one page of results; one query. */
  async describe(ids: string[]): Promise<Map<string, ExerciseDetails>> {
    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        muscleGroups: {
          select: { muscleGroupCode: true, role: true },
          orderBy: [{ role: 'asc' }, { muscleGroupCode: 'asc' }],
        },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          muscleGroups: row.muscleGroups.map((group) => ({
            code: group.muscleGroupCode,
            role: group.role,
          })),
        },
      ]),
    );
  }
}
