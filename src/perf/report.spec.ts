import { markdownTable, parseAutoExplain, percentile, summarize, truncate } from './report';

/**
 * Statement 3 of docs/perf/plans/warm/P1-records-largest-exercise.txt, re-assembled into the NOTICE format it was
 * captured in (auto_explain, PG16): the maxWeight candidate query of the most-logged exercise.
 */
const PR_NOTICE = `duration: 30.746 ms  plan:
Query Text: SELECT "public"."workout_sets"."id", "public"."workout_sets"."weight_kg", "public"."workout_sets"."volume_kg", "public"."workout_sets"."e1rm_kg" FROM "public"."workout_sets" WHERE ("public"."workout_sets"."user_id" = $1 AND "public"."workout_sets"."exercise_id" = $2 AND "public"."workout_sets"."weight_kg" > $3) ORDER BY "public"."workout_sets"."weight_kg" DESC, "public"."workout_sets"."reps" DESC, "public"."workout_sets"."performed_at" ASC, "public"."workout_sets"."id" ASC LIMIT $4 OFFSET $5
Query Parameters: $1 = 'perf-heavy', $2 = '01a11ad8-161d-743b-a69d-25c64cfff473', $3 = '0', $4 = '50', $5 = '0'
Limit  (cost=24247.99..24253.82 rows=50 width=44) (actual time=28.048..30.725 rows=50 loops=1)
  Buffers: shared hit=1463
  ->  Gather Merge  (cost=24247.99..33183.41 rows=76584 width=44) (actual time=28.047..30.721 rows=50 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=1463
        ->  Sort  (cost=23247.96..23343.69 rows=38292 width=44) (actual time=21.662..21.663 rows=34 loops=3)
              Sort Key: weight_kg DESC, reps DESC, performed_at, id
              Sort Method: top-N heapsort  Memory: 33kB
              Buffers: shared hit=1463
              Worker 0:  Sort Method: top-N heapsort  Memory: 34kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 33kB
              ->  Parallel Index Only Scan using workout_sets_pr_covering_idx on workout_sets  (cost=0.55..21975.93 rows=38292 width=44) (actual time=0.021..16.518 rows=17712 loops=3)
                    Index Cond: ((user_id = 'perf-heavy'::text) AND (exercise_id = '01a11ad8-161d-743b-a69d-25c64cfff473'::uuid) AND (weight_kg > '0'::numeric))
                    Heap Fetches: 0
                    Buffers: shared hit=1405`;

/** H1's set query (docs/perf/plans/warm/H1-history-first-page.txt), abridged: the 21-id IN list is cut to 2 ids. */
const BITMAP_NOTICE = `duration: 0.103 ms  plan:
Query Text: SELECT "public"."workout_sets"."entry_id" FROM "public"."workout_sets" WHERE "public"."workout_sets"."entry_id" IN ($1,$2) ORDER BY "public"."workout_sets"."entry_id" ASC, "public"."workout_sets"."set_number" ASC OFFSET $3
Query Parameters: $1 = '01a0f4c0-ef40-7b20-91a3-ee2cc4726b14', $2 = '01a0f48e-94a0-776e-9873-dab3416433f0', $3 = '0'
Sort  (cost=449.24..449.47 rows=94 width=46) (actual time=0.078..0.082 rows=88 loops=1)
  Sort Key: entry_id, set_number
  Buffers: shared hit=68
  ->  Bitmap Heap Scan on workout_sets  (cost=89.32..446.15 rows=94 width=46) (actual time=0.034..0.046 rows=88 loops=1)
        Recheck Cond: (entry_id = ANY ('{01a0f4c0-ef40-7b20-91a3-ee2cc4726b14,01a0f48e-94a0-776e-9873-dab3416433f0}'::uuid[]))
        Heap Blocks: exact=2
        Buffers: shared hit=62
        ->  Bitmap Index Scan on workout_sets_entry_id_set_number_key  (cost=0.00..89.25 rows=94 width=0) (actual time=0.027..0.027 rows=88 loops=1)
              Index Cond: (entry_id = ANY ('{01a0f4c0-ef40-7b20-91a3-ee2cc4726b14,01a0f48e-94a0-776e-9873-dab3416433f0}'::uuid[]))
              Buffers: shared hit=60`;

/** Synthetic, in PG16's format: a top-level scan without "->", no parameters, a backward scan, a skipped node. */
const SYNTHETIC_NOTICE = `duration: 0.050 ms  plan:
Query Text: SELECT 1 FROM workout_entries e
Nested Loop  (cost=0.84..16.90 rows=1 width=4) (actual time=0.010..0.011 rows=0 loops=1)
  Buffers: shared hit=3 read=1
  ->  Index Only Scan Backward using workout_entries_user_id_performed_at_id_idx on workout_entries e  (cost=0.42..8.44 rows=21 width=16) (actual time=0.008..0.008 rows=0 loops=1)
        Index Cond: (user_id = 'u'::text)
        Heap Fetches: 2
  ->  Index Scan using workout_sets_pkey on workout_sets s  (cost=0.42..8.44 rows=1 width=16) (never executed)
        Index Cond: (id = e.id)`;

describe('percentile', () => {
  it('uses the nearest-rank method on unsorted input', () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 100)).toBe(10);
    expect(percentile([7], 95)).toBe(7);
  });

  it('rejects an empty sample', () => {
    expect(() => percentile([], 50)).toThrow();
  });
});

describe('summarize', () => {
  it('reports count, p50, p95 and max', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarize(values)).toEqual({ n: 100, p50: 50, p95: 95, max: 100 });
  });
});

describe('markdownTable', () => {
  it('renders a header, a separator and right-aligned numeric columns', () => {
    expect(
      markdownTable(
        ['Query', 'ms'],
        [
          ['history', 1.5],
          ['records', 12],
        ],
      ),
    ).toBe('| Query | ms |\n|---|---:|\n| history | 1.5 |\n| records | 12 |');
  });

  it('escapes pipes inside cells', () => {
    expect(markdownTable(['a'], [['x | y']])).toBe('| a |\n|---|\n| x \\| y |');
  });
});

describe('parseAutoExplain', () => {
  it('extracts duration, query, parameters and the top-level buffers', () => {
    const plan = parseAutoExplain(PR_NOTICE);
    expect(plan.durationMs).toBe(30.746);
    expect(plan.queryText).toMatch(
      /^SELECT "public"."workout_sets"."id", "public"."workout_sets"."weight_kg"/,
    );
    expect(plan.queryText).toMatch(/LIMIT \$4 OFFSET \$5$/);
    expect(plan.parameters).toBe(
      "$1 = 'perf-heavy', $2 = '01a11ad8-161d-743b-a69d-25c64cfff473', $3 = '0', $4 = '50', $5 = '0'",
    );
    expect(plan.buffers).toEqual({ hit: 1463, read: 0 });
  });

  it('lists a scan with its index, relation and per-loop estimated vs actual rows (as EXPLAIN prints them)', () => {
    expect(parseAutoExplain(PR_NOTICE).scans).toEqual([
      {
        node: 'Parallel Index Only Scan',
        index: 'workout_sets_pr_covering_idx',
        relation: 'workout_sets',
        estimatedRows: 38292,
        actualRows: 17712,
        loops: 3,
        heapFetches: 0,
      },
    ]);
  });

  it('attributes a Bitmap Index Scan to the table of its Bitmap Heap Scan', () => {
    expect(parseAutoExplain(BITMAP_NOTICE).scans).toEqual([
      {
        node: 'Bitmap Heap Scan',
        index: null,
        relation: 'workout_sets',
        estimatedRows: 94,
        actualRows: 88,
        loops: 1,
        heapFetches: null,
      },
      {
        node: 'Bitmap Index Scan',
        index: 'workout_sets_entry_id_set_number_key',
        relation: 'workout_sets',
        estimatedRows: 94,
        actualRows: 88,
        loops: 1,
        heapFetches: null,
      },
    ]);
  });

  it('reads backward scans, aliases, never-executed nodes and notices without parameters', () => {
    const plan = parseAutoExplain(SYNTHETIC_NOTICE);
    expect(plan.parameters).toBeNull();
    expect(plan.buffers).toEqual({ hit: 3, read: 1 });
    expect(plan.scans).toEqual([
      {
        node: 'Index Only Scan Backward',
        index: 'workout_entries_user_id_performed_at_id_idx',
        relation: 'workout_entries',
        estimatedRows: 21,
        actualRows: 0,
        loops: 1,
        heapFetches: 2,
      },
      {
        node: 'Index Scan',
        index: 'workout_sets_pkey',
        relation: 'workout_sets',
        estimatedRows: 1,
        actualRows: 0,
        loops: 0,
        heapFetches: null,
      },
    ]);
  });

  it('keeps the plan text for the raw plan files', () => {
    expect(parseAutoExplain(BITMAP_NOTICE).planText).toMatch(/^Sort {2}\(cost/);
  });
});

describe('truncate', () => {
  it('keeps short text and shortens long text with the number of characters left out', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('x'.repeat(25), 10)).toBe('xxxxxxxxxx… (15 more characters)');
  });
});
