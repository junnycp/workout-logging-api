import { createPgAdapter } from '../src/database/pg-adapter';
import { PrismaClient } from '../src/generated/prisma/client';

/** Guards the index strategy in docs/DESIGN.md: a migration that drops one of these fails the build. */
describe('Database schema (integration)', () => {
  const prisma = new PrismaClient({
    adapter: createPgAdapter(process.env.DATABASE_URL as string),
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has every index the query plan relies on', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'`;
    const definitions = rows.map((row) => row.indexdef);
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'workout_entries USING btree (user_id, performed_at DESC, id DESC)',
        ),
        expect.stringContaining(
          'workout_entries USING btree (user_id, exercise_id, performed_at DESC, id DESC)',
        ),
        expect.stringContaining(
          'workout_sets USING btree (user_id, exercise_id, performed_at, weight_kg, reps, volume_kg, e1rm_kg)',
        ),
        expect.stringContaining('exercise_names USING gin (name_key gin_trgm_ops)'),
        expect.stringContaining(
          'exercise_muscle_groups USING btree (muscle_group_code, exercise_id)',
        ),
      ]),
    );
  });

  it('rejects invalid set values at the database level as a last line of defence', async () => {
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text IN ('workout_sets', 'workout_entries')`;
    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'workout_entries_utc_offset_range',
      'workout_sets_reps_positive',
      'workout_sets_set_number_positive',
      'workout_sets_weight_non_negative',
    ]);
  });
});
