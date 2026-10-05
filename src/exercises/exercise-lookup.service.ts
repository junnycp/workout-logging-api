import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface ExerciseRef {
  id: string;
  name: string;
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
}
