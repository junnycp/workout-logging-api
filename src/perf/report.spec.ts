import { markdownTable, parseAutoExplain, percentile, summarize } from './report';

/** A real auto_explain notice (PG16) captured from the PR candidate query on the perf dataset. */
const PR_NOTICE = `duration: 98.653 ms  plan:
Query Text: SELECT "public"."workout_sets"."id" FROM "public"."workout_sets" WHERE ("public"."workout_sets"."user_id" = $1 AND "public"."workout_sets"."exercise_id" = $2) LIMIT $3 OFFSET $4
Query Parameters: $1 = 'perf-heavy', $2 = '01a11ad8-161d-743b-a69d-25c64cfff473', $3 = '50', $4 = '0'
Limit  (cost=13705.25..13711.08 rows=50 width=33) (actual time=96.955..98.627 rows=50 loops=1)
  Buffers: shared hit=66 read=1397 written=374
  ->  Gather Merge  (cost=13705.25..22709.51 rows=77174 width=33) (actual time=96.954..98.622 rows=50 loops=1)
        Workers Planned: 2
        Buffers: shared hit=66 read=1397 written=374
        ->  Sort  (cost=12705.22..12801.69 rows=38587 width=33) (actual time=90.752..90.754 rows=39 loops=3)
              Sort Key: weight_kg DESC, reps DESC, performed_at, id
              ->  Parallel Index Only Scan using workout_sets_pr_covering_idx on workout_sets  (cost=0.55..11423.39 rows=38587 width=33) (actual time=0.458..87.034 rows=17712 loops=3)
                    Index Cond: ((user_id = 'perf-heavy'::text))
                    Heap Fetches: 0
                    Buffers: shared hit=8 read=1397 written=374`;

const SEQ_NOTICE = `duration: 0.252 ms  plan:
Query Text: SELECT "public"."exercises"."id" FROM "public"."exercises" WHERE "public"."exercises"."name" = $1
Query Parameters: $1 = 'Bench Press'
Limit  (cost=0.00..1.71 rows=1 width=46) (actual time=0.020..0.021 rows=1 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on exercises  (cost=0.00..1.71 rows=1 width=46) (actual time=0.019..0.019 rows=1 loops=1)
        Filter: ((name)::text = 'Bench Press'::text)
        Buffers: shared hit=1`;

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
    expect(plan.durationMs).toBe(98.653);
    expect(plan.queryText).toMatch(/^SELECT "public"."workout_sets"."id"/);
    expect(plan.parameters).toBe(
      "$1 = 'perf-heavy', $2 = '01a11ad8-161d-743b-a69d-25c64cfff473', $3 = '50', $4 = '0'",
    );
    expect(plan.buffers).toEqual({ hit: 66, read: 1397 });
  });

  it('lists every scan with its index, relation and per-loop estimated vs actual rows (as EXPLAIN prints them)', () => {
    expect(parseAutoExplain(PR_NOTICE).scans).toEqual([
      {
        node: 'Parallel Index Only Scan',
        index: 'workout_sets_pr_covering_idx',
        relation: 'workout_sets',
        estimatedRows: 38587,
        actualRows: 17712,
        loops: 3,
        heapFetches: 0,
      },
    ]);
    expect(parseAutoExplain(SEQ_NOTICE).scans).toEqual([
      {
        node: 'Seq Scan',
        index: null,
        relation: 'exercises',
        estimatedRows: 1,
        actualRows: 1,
        loops: 1,
        heapFetches: null,
      },
    ]);
  });

  it('keeps the plan text for the raw plan files', () => {
    expect(parseAutoExplain(SEQ_NOTICE).planText).toMatch(/^Limit {2}\(cost/);
  });
});
