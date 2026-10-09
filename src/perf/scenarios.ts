import { encodeCursor } from '../common/pagination/cursor';
import type { PrismaClient } from '../generated/prisma/client';

/** One HTTP call against the API, relative to the API base URL. */
export interface PerfRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  expectStatus: number;
}

/**
 * A measured case. `requests[0]` is the representative call whose query plans are captured; the latency pass
 * cycles through all of them so a percentile is not one hot cache path.
 */
export interface PerfScenario {
  id: string;
  title: string;
  requests: PerfRequest[];
  /** Also measured with 20 requests in flight (pool behaviour). */
  concurrent?: boolean;
  /** Caps the latency samples (the max bulk writes 5,000 sets per call). */
  maxIterations?: number;
}

export const HEAVY = 'perf-heavy';
export const SINGLE = 'perf-single';
const BACKGROUND = Array.from(
  { length: 50 },
  (_, i) => `perf-bg-${String(i + 1).padStart(3, '0')}`,
);
/** POST scenarios write as these users; their rows are deleted after every pass. */
export const WRITE_USER_PREFIX = 'perf-write';

const REGULAR_EXERCISES = [
  'Bench Press',
  'Back Squat',
  'Deadlift',
  'Overhead Press',
  'Lat Pulldown',
  'Romanian Deadlift',
  'Incline Bench Press',
  'Dumbbell Row',
  'Leg Press',
  'Barbell Curl',
  'Front Squat',
  'Lateral Raise',
  'Hip Thrust',
  'Face Pull',
  'Goblet Squat',
];
/** Explicit, data-anchored ranges (the dataset ends 2026-10-01): results do not depend on today's date. */
const SEPT = { from: '2026-09-01', to: '2026-09-30' };
const AUG = { from: '2026-08-01', to: '2026-08-31' };
const TZ = 'Asia/Ho_Chi_Minh';

const history = (userId: string, query: Record<string, string> = {}): PerfRequest => ({
  method: 'GET',
  path: `/api/v1/users/${userId}/workouts`,
  query,
  expectStatus: 200,
});
const records = (
  userId: string,
  query: Record<string, string>,
  expectStatus = 200,
): PerfRequest => ({
  method: 'GET',
  path: `/api/v1/users/${userId}/personal-records`,
  query,
  expectStatus,
});
const compare = (userId: string, exercise: string): PerfRequest => ({
  method: 'GET',
  path: `/api/v1/users/${userId}/personal-records/compare`,
  query: {
    exercise,
    tz: TZ,
    currentFrom: SEPT.from,
    currentTo: SEPT.to,
    previousFrom: AUG.from,
    previousTo: AUG.to,
  },
  expectStatus: 200,
});
const post = (entries: number, setsPerEntry: number): PerfRequest => ({
  method: 'POST',
  path: `/api/v1/users/${WRITE_USER_PREFIX}-${entries}x${setsPerEntry}/workouts`,
  body: {
    entries: Array.from({ length: entries }, (_, i) => ({
      exerciseName: REGULAR_EXERCISES[i % REGULAR_EXERCISES.length],
      date: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T18:30:00+07:00`,
      sets: Array.from({ length: setsPerEntry }, (_, s) => ({
        reps: 5 + (s % 6),
        weight: 60 + 2.5 * (s % 8),
        unit: s % 4 === 0 ? 'lb' : 'kg',
      })),
    })),
  },
  expectStatus: 201,
});

/**
 * The scenario list, built from the seeded data (cursors at given depths need real rows). Fails when the
 * dataset is missing; perf-single scenarios appear only when that optional user was seeded.
 */
export async function buildScenarios(prisma: PrismaClient): Promise<PerfScenario[]> {
  const heavyEntries = await prisma.workoutEntry.count({ where: { userId: HEAVY } });
  if (heavyEntries === 0) throw new Error(`No rows for ${HEAVY}: run "npm run seed:perf" first.`);
  const hasSingle = (await prisma.workoutEntry.count({ where: { userId: SINGLE } })) > 0;

  const cursorAt = async (depth: number): Promise<string> => {
    const row = await prisma.workoutEntry.findFirstOrThrow({
      where: { userId: HEAVY },
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
      skip: Math.min(depth, heavyEntries) - 1,
      select: { performedAt: true, id: true },
    });
    return encodeCursor(row);
  };
  const depths = [1_000, 5_000, 10_000, 15_000, 20_000, 30_000, 35_000, 40_000, 45_000, 49_000];
  const deepCursors = await Promise.all(depths.map(cursorAt));
  const lastPage = await cursorAt(heavyEntries - 20);

  const scenarios: PerfScenario[] = [
    {
      id: 'H1-history-first-page',
      title: 'History, first page, no filter',
      requests: [history(HEAVY), ...BACKGROUND.slice(0, 9).map((u) => history(u))],
      concurrent: true,
    },
    {
      id: 'H2-history-deep-cursor',
      title: 'History, page at depth 1k-49k (cursor)',
      requests: [
        history(HEAVY, { cursor: lastPage }),
        ...deepCursors.map((cursor) => history(HEAVY, { cursor })),
      ],
    },
    {
      id: 'H3-history-partial-name',
      title: 'History, partial name "bench press" (5 exercises)',
      requests: ['bench press', 'squat', 'curl', 'row', 'deadlift'].map((exercise) =>
        history(HEAVY, { exercise }),
      ),
    },
    {
      id: 'H4-history-broad-name',
      title: 'History, broad name "e" (most of the catalog)',
      requests: ['e', 'a', 'r'].map((exercise) => history(HEAVY, { exercise })),
    },
    {
      id: 'H5-history-old-exercise',
      title: 'History, exercise only logged > 2 years ago (skew)',
      requests: [history(HEAVY, { exercise: 'sumo deadlift' })],
    },
    {
      id: 'H6-history-muscle-group',
      title: 'History, muscleGroup=chest',
      requests: ['chest', 'quads', 'biceps', 'lats'].map((muscleGroup) =>
        history(HEAVY, { muscleGroup }),
      ),
    },
    {
      id: 'H7-history-range-and-name',
      title: 'History, one month in Asia/Ho_Chi_Minh + name',
      requests: [
        history(HEAVY, { exercise: 'bench press', from: SEPT.from, to: SEPT.to, tz: TZ }),
        history(HEAVY, { exercise: 'squat', from: AUG.from, to: AUG.to, tz: TZ }),
      ],
    },
    {
      id: 'H8-history-100-in-lb',
      title: 'History, limit=100, unit=lb',
      requests: [
        history(HEAVY, { limit: '100', unit: 'lb' }),
        history(HEAVY, { limit: '100', unit: 'lb', cursor: deepCursors[4] as string }),
      ],
    },
    {
      id: 'P1-records-largest-exercise',
      title: 'PRs, all-time, most-logged exercise (Bench Press, ~53k sets)',
      requests: [records(HEAVY, { exercise: 'Bench Press' })],
    },
    {
      id: 'P2-records-typical-exercises',
      title: 'PRs, all-time, 15 exercises of perf-heavy (plan: Leg Press, ~6k sets)',
      // A mid-frequency exercise first: requests[0] is the one whose plan is captured.
      requests: [...REGULAR_EXERCISES.slice(8), ...REGULAR_EXERCISES.slice(0, 8)].map((exercise) =>
        records(HEAVY, { exercise }),
      ),
      concurrent: true,
    },
    {
      id: 'P3-records-one-month',
      title: 'PRs, one month, Bench Press',
      requests: [records(HEAVY, { exercise: 'Bench Press', from: SEPT.from, to: SEPT.to, tz: TZ })],
    },
    {
      id: 'P4-records-plateau',
      title: 'PRs, plateau: every set tied on the top value (Barbell Row)',
      requests: [records(HEAVY, { exercise: 'Barbell Row' })],
    },
    {
      id: 'P5-records-natural-ties',
      title: 'PRs, > 50 natural ties on the top weight (Lateral Raise)',
      requests: [records(HEAVY, { exercise: 'Lateral Raise' })],
    },
    {
      id: 'P6-records-bodyweight-only',
      title: 'PRs, bodyweight-only exercise (Pull-Up)',
      requests: [records(HEAVY, { exercise: 'Pull-Up' })],
    },
    {
      id: 'P7-records-typical-user',
      title: 'PRs, background user (2k entries)',
      requests: BACKGROUND.slice(0, 10).map((u) => records(u, { exercise: 'Bench Press' })),
    },
    {
      id: 'P8-records-unknown-name',
      title: 'PRs, unknown name -> 400 with suggestions',
      requests: [records(HEAVY, { exercise: 'bench pres' }, 400)],
    },
    {
      id: 'C1-compare-months',
      title: 'Compare Sept vs Aug (explicit bounds)',
      requests: ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press'].map((e) =>
        compare(HEAVY, e),
      ),
    },
    {
      id: 'W1-post-one-entry',
      title: 'POST 1 entry x 5 sets',
      requests: [post(1, 5)],
    },
    {
      id: 'W2-post-max-bulk',
      title: 'POST 100 entries x 50 sets (max bulk)',
      requests: [post(100, 50)],
      maxIterations: 20,
    },
  ];

  if (hasSingle) {
    scenarios.push(
      {
        id: 'S1-records-single-exercise-user',
        title: 'PRs, perf-single (50k entries of one exercise), all-time',
        requests: [records(SINGLE, { exercise: 'Bench Press' })],
      },
      {
        id: 'S2-compare-single-exercise-user',
        title: 'Compare, perf-single',
        requests: [compare(SINGLE, 'Bench Press')],
      },
    );
  }
  return scenarios;
}

/** Full URL of a request against `baseUrl`. */
export function urlOf(baseUrl: string, request: PerfRequest): string {
  const url = new URL(request.path, baseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** Sends one request and checks its status; returns the elapsed milliseconds (body fully read). */
export async function send(baseUrl: string, request: PerfRequest): Promise<number> {
  const started = performance.now();
  const response = await fetch(urlOf(baseUrl, request), {
    method: request.method,
    headers: request.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await response.text();
  const elapsed = performance.now() - started;
  if (response.status !== request.expectStatus) {
    throw new Error(
      `${request.method} ${urlOf(baseUrl, request)}: expected ${request.expectStatus}, got ${response.status} ${text.slice(0, 300)}`,
    );
  }
  return elapsed;
}

/** Removes everything the POST scenarios wrote. */
export async function deleteWrittenRows(prisma: PrismaClient): Promise<void> {
  const where = { userId: { startsWith: WRITE_USER_PREFIX } };
  await prisma.workoutSet.deleteMany({ where });
  await prisma.workoutEntry.deleteMany({ where });
  await prisma.idempotencyKey.deleteMany({ where });
}

/** Table and index sizes plus index usage since the last statistics reset. */
export async function indexUsage(
  prisma: PrismaClient,
): Promise<{ table: string; index: string; scans: number; size: string }[]> {
  const rows = await prisma.$queryRaw<
    { table: string; index: string; scans: bigint; size: string }[]
  >`
    SELECT relname AS "table", indexrelname AS "index", idx_scan AS scans,
           pg_size_pretty(pg_relation_size(indexrelid)) AS size
    FROM pg_stat_user_indexes
    WHERE relname IN ('workout_entries', 'workout_sets', 'exercise_names', 'exercises',
                      'exercise_muscle_groups', 'muscle_groups', 'idempotency_keys')
    ORDER BY relname, indexrelname`;
  return rows.map((row) => ({ ...row, scans: Number(row.scans) }));
}

export async function tableSizes(
  prisma: PrismaClient,
): Promise<{ table: string; rows: number; heap: string; indexes: string; total: string }[]> {
  const rows = await prisma.$queryRaw<
    { table: string; rows: bigint; heap: string; indexes: string; total: string }[]
  >`
    SELECT c.relname AS "table", c.reltuples::bigint AS rows,
           pg_size_pretty(pg_relation_size(c.oid)) AS heap,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indexes,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total
    FROM pg_class c
    WHERE c.relname IN ('workout_entries', 'workout_sets') AND c.relkind = 'r'
    ORDER BY c.relname`;
  return rows.map((row) => ({ ...row, rows: Number(row.rows) }));
}
