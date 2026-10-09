import { encodeCursor } from '../common/pagination/cursor';
import type { PrismaClient } from '../generated/prisma/client';
import { expandUsers, PerfProfile } from './perf-profile';

/**
 * What a successful response must contain, so a scenario whose data is missing (e.g. after a profile change)
 * fails instead of being reported as fast: `entries` = non-empty history page, `records` = a maxWeight record,
 * `no-records` = null records with a message, `comparison` = records in both periods.
 */
export type Expectation = 'entries' | 'records' | 'no-records' | 'comparison';

/** One HTTP call against the API, relative to the API base URL. */
export interface PerfRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  expectStatus: number;
  expect?: Expectation;
}

/**
 * A measured case. `requests[0]` is the representative call whose query plans are captured; the latency pass
 * cycles through all of them so a percentile is not one hot cache path.
 */
export interface PerfScenario {
  id: string;
  title: string;
  requests: [PerfRequest, ...PerfRequest[]];
  /** Also measured with 20 requests in flight (pool behaviour). */
  concurrent?: boolean;
  /** Caps the latency samples (the max bulk writes 5,000 sets per call). */
  maxIterations?: number;
}

export const HEAVY = 'perf-heavy';
export const SINGLE = 'perf-single';
const BACKGROUND_PREFIX = 'perf-bg-';
/** POST scenarios write as these users; their rows are deleted after every pass. */
export const WRITE_USER_PREFIX = 'perf-write';

/** Explicit, data-anchored ranges (the dataset ends 2026-10-01): results do not depend on today's date. */
const SEPT = { from: '2026-09-01', to: '2026-09-30' };
const AUG = { from: '2026-08-01', to: '2026-08-31' };
const TZ = 'Asia/Ho_Chi_Minh';

const history = (userId: string, query: Record<string, string> = {}): PerfRequest => ({
  method: 'GET',
  path: `/api/v1/users/${userId}/workouts`,
  query,
  expectStatus: 200,
  expect: 'entries',
});
const records = (
  userId: string,
  query: Record<string, string>,
  expectation: Expectation | 400 = 'records',
): PerfRequest => ({
  method: 'GET',
  path: `/api/v1/users/${userId}/personal-records`,
  query,
  ...(expectation === 400 ? { expectStatus: 400 } : { expectStatus: 200, expect: expectation }),
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
  expect: 'comparison',
});
const post = (exercises: string[], entries: number, setsPerEntry: number): PerfRequest => ({
  method: 'POST',
  path: `/api/v1/users/${WRITE_USER_PREFIX}-${entries}x${setsPerEntry}/workouts`,
  body: {
    entries: Array.from({ length: entries }, (_, i) => ({
      exerciseName: exercises[i % exercises.length],
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
 * The scenario list, built from the profile (users, exercises, scenario exercises) and the seeded data (cursors at
 * given depths need real rows). Fails when the dataset is missing; perf-single scenarios appear only when that
 * optional user was seeded. POST scenarios come last, so their writes cannot affect the read scenarios.
 */
export async function buildScenarios(
  prisma: PrismaClient,
  profile: PerfProfile,
): Promise<PerfScenario[]> {
  const users = expandUsers(profile, { includeOptional: true });
  const heavy = users.find((user) => user.id === HEAVY);
  const { oldOnly, bodyweightOnly, plateau } = heavy?.scenarios ?? {};
  if (!heavy || !oldOnly || !bodyweightOnly || !plateau)
    throw new Error(
      `The profile must define ${HEAVY} with oldOnly, bodyweightOnly and plateau scenarios.`,
    );
  const background = users.filter((user) => user.id.startsWith(BACKGROUND_PREFIX)).map((u) => u.id);
  // The 15 most-logged exercises (the profile lists them by frequency, Zipf-like).
  const exercises = heavy.exercises.slice(0, 15);
  const [first = '', second = '', third = '', fourth = ''] = exercises;

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

  const atLeastOne = <T>(items: T[]): [T, ...T[]] => {
    const [head, ...rest] = items;
    if (head === undefined) throw new Error('A scenario needs at least one request');
    return [head, ...rest];
  };
  const typicalUsers = background.slice(0, 10);

  const scenarios: PerfScenario[] = [
    {
      id: 'H1-history-first-page',
      title: 'History, first page, no filter (perf-heavy + 9 background users)',
      requests: atLeastOne([HEAVY, ...typicalUsers.slice(0, 9)].map((u) => history(u))),
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
      title: 'History, partial name ("bench press" matches 5 exercises)',
      requests: atLeastOne(
        ['bench press', 'squat', 'curl', 'row', 'deadlift'].map((exercise) =>
          history(HEAVY, { exercise }),
        ),
      ),
    },
    {
      id: 'H4-history-broad-name',
      title: 'History, broad name "e" (most of the catalog)',
      requests: atLeastOne(['e', 'a', 'r'].map((exercise) => history(HEAVY, { exercise }))),
    },
    {
      id: 'H5-history-old-exercise',
      title: `History, ${oldOnly.exercise}: only logged in the first ${oldOnly.withinFirstDays} days (skew)`,
      requests: [history(HEAVY, { exercise: oldOnly.exercise })],
    },
    {
      id: 'H6-history-muscle-group',
      title: 'History, muscleGroup (chest, quads, biceps, lats)',
      requests: atLeastOne(
        ['chest', 'quads', 'biceps', 'lats'].map((muscleGroup) => history(HEAVY, { muscleGroup })),
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
        ...deepCursors
          .slice(4, 5)
          .map((cursor) => history(HEAVY, { limit: '100', unit: 'lb', cursor })),
      ],
    },
    {
      id: 'P1-records-largest-exercise',
      title: `PRs, all-time, most-logged exercise (${first})`,
      requests: [records(HEAVY, { exercise: first })],
    },
    {
      id: 'P2-records-typical-exercises',
      title: 'PRs, all-time, exercises 4-15 by frequency (the 3 most-logged excluded)',
      // A mid-frequency exercise first: requests[0] is the one whose plan is captured.
      requests: atLeastOne(
        [...exercises.slice(8), ...exercises.slice(3, 8)].map((exercise) =>
          records(HEAVY, { exercise }),
        ),
      ),
      concurrent: true,
    },
    {
      id: 'P3-records-one-month',
      title: `PRs, one month, ${first}`,
      requests: [records(HEAVY, { exercise: first, from: SEPT.from, to: SEPT.to, tz: TZ })],
    },
    {
      id: 'P4-records-plateau',
      title: `PRs, plateau: every set tied on the top value (${plateau.exercise})`,
      requests: [records(HEAVY, { exercise: plateau.exercise })],
    },
    {
      id: 'P5-records-natural-ties',
      title: 'PRs, Lateral Raise: more than 50 sets tied on the top weight in this dataset',
      requests: [records(HEAVY, { exercise: 'Lateral Raise' })],
    },
    {
      id: 'P6-records-bodyweight-only',
      title: `PRs, bodyweight-only exercise (${bodyweightOnly.exercise})`,
      requests: [records(HEAVY, { exercise: bodyweightOnly.exercise }, 'no-records')],
    },
    {
      id: 'P7-records-typical-user',
      title: `PRs, background users (2k entries), ${first}`,
      requests: atLeastOne(typicalUsers.map((u) => records(u, { exercise: first }))),
    },
    {
      id: 'P8-records-unknown-name',
      title: 'PRs, unknown name -> 400 with suggestions',
      requests: [records(HEAVY, { exercise: 'bench pres' }, 400)],
    },
    {
      id: 'C1-compare-months',
      title: 'Compare Sept vs Aug (explicit bounds), 4 most-logged exercises',
      requests: [
        compare(HEAVY, first),
        compare(HEAVY, second),
        compare(HEAVY, third),
        compare(HEAVY, fourth),
      ],
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

  scenarios.push(
    { id: 'W1-post-one-entry', title: 'POST 1 entry x 5 sets', requests: [post(exercises, 1, 5)] },
    {
      id: 'W2-post-max-bulk',
      title: 'POST 100 entries x 50 sets (max bulk)',
      requests: [post(exercises, 100, 50)],
      maxIterations: 20,
    },
  );
  return scenarios;
}

/** The i-th request of a scenario, cycling through its variants. */
export function requestAt(scenario: PerfScenario, i: number): PerfRequest {
  return scenario.requests[i % scenario.requests.length] ?? scenario.requests[0];
}

/** `--only S1,S2` keeps the scenarios whose id starts with one of the prefixes; no flag keeps all. */
export function selectScenarios(
  scenarios: PerfScenario[],
  argv: readonly string[],
): PerfScenario[] {
  const at = argv.indexOf('--only');
  if (at < 0) return scenarios;
  const prefixes = (argv[at + 1] ?? '').split(',').filter(Boolean);
  const selected = scenarios.filter((s) => prefixes.some((prefix) => s.id.startsWith(prefix)));
  if (selected.length === 0) throw new Error(`--only ${argv[at + 1]} matches no scenario`);
  return selected;
}

/** Full URL of a request against `baseUrl`. */
export function urlOf(baseUrl: string, request: PerfRequest): string {
  const url = new URL(request.path, baseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

const failure = (expectation: Expectation, body: unknown): string | null => {
  const { data, meta } = (body ?? {}) as { data?: unknown; meta?: { message?: string } };
  const record = (side: unknown) => (side as { maxWeight?: unknown } | undefined)?.maxWeight;
  switch (expectation) {
    case 'entries':
      return Array.isArray(data) && data.length > 0 ? null : 'empty history page';
    case 'records':
      return record(data) ? null : 'no record';
    case 'no-records':
      return record(data) === null && meta?.message ? null : 'expected null records with a message';
    case 'comparison': {
      const { current, previous } = (data ?? {}) as { current?: unknown; previous?: unknown };
      return record(current) && record(previous) ? null : 'a period without records';
    }
  }
};

/**
 * Sends one request and checks its status and, when set, its content (an empty result would be measured as
 * fast); returns the elapsed milliseconds with the body fully read.
 */
export async function send(baseUrl: string, request: PerfRequest): Promise<number> {
  const started = performance.now();
  const response = await fetch(urlOf(baseUrl, request), {
    method: request.method,
    headers: request.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await response.text();
  const elapsed = performance.now() - started;
  const problem =
    response.status !== request.expectStatus
      ? `expected ${request.expectStatus}, got ${response.status}`
      : request.expect && failure(request.expect, JSON.parse(text) as unknown);
  if (problem) {
    throw new Error(
      `${request.method} ${urlOf(baseUrl, request)}: ${problem}: ${text.slice(0, 300)}`,
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
