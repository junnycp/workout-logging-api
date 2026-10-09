import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from '../config/env.schema';
import { createPgAdapter } from '../database/pg-adapter';
import { PrismaClient } from '../generated/prisma/client';
import { loadPerfProfile } from '../perf/perf-profile';
import { markdownTable, summarize } from '../perf/report';
import {
  buildScenarios,
  deleteWrittenRows,
  indexUsage,
  PerfScenario,
  requestAt,
  selectScenarios,
  send,
} from '../perf/scenarios';

/**
 * End-to-end latency of every performance scenario against an API running in ANOTHER process (the compose
 * `api` container or `npm run start:prod`), so the load generator never shares the server's event loop and no
 * EXPLAIN instrumentation is active.
 *
 *   PERF_API_URL=http://localhost:3000 npm run perf:latency -- --label warm
 *
 * Per scenario: 5 warm-up calls, then PERF_ITERATIONS (default 100) sequential calls cycling through the
 * scenario's request variants. Scenarios marked `concurrent` are also measured in closed-loop batches of 20
 * parallel requests (each batch waits for its slowest request). `--only <prefixes>` selects scenarios.
 * Writes docs/perf/latency-<label>.md. Needs DATABASE_URL to build cursors and to clean up POSTed rows.
 */
const WARM_UP = 5;
const CONCURRENCY = 20;
/** Idle backends flush their pending statistics within 10 s (PostgreSQL 15+); idx_scan is read after that. */
const STATS_FLUSH_MS = 11_000;

async function sequential(
  baseUrl: string,
  scenario: PerfScenario,
  iterations: number,
): Promise<number[]> {
  for (let i = 0; i < WARM_UP; i++) await send(baseUrl, requestAt(scenario, i));
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) samples.push(await send(baseUrl, requestAt(scenario, i)));
  return samples;
}

async function concurrent(
  baseUrl: string,
  scenario: PerfScenario,
  iterations: number,
): Promise<number[]> {
  const samples: number[] = [];
  for (let round = 0; samples.length < iterations; round++) {
    const batch = Array.from({ length: CONCURRENCY }, (_, i) =>
      send(baseUrl, requestAt(scenario, round * CONCURRENCY + i)),
    );
    samples.push(...(await Promise.all(batch)));
  }
  return samples;
}

const ms = (value: number): number => Number(value.toFixed(1));

async function main(): Promise<void> {
  const { DATABASE_URL } = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const baseUrl = process.env.PERF_API_URL ?? 'http://localhost:3000';
  const iterations = Number(process.env.PERF_ITERATIONS ?? 100);
  const labelAt = process.argv.indexOf('--label');
  const label = labelAt >= 0 ? (process.argv[labelAt + 1] ?? 'warm') : 'warm';
  const outDir = process.env.PERF_OUT ?? 'docs/perf';

  const prisma = new PrismaClient({ adapter: createPgAdapter(DATABASE_URL) });
  try {
    const profile = loadPerfProfile(process.env.PERF_PROFILE);
    const scenarios = selectScenarios(await buildScenarios(prisma, profile), process.argv);
    await prisma.$executeRawUnsafe('SELECT pg_stat_reset()');

    const rows: (string | number)[][] = [];
    for (const scenario of scenarios) {
      const n = Math.min(iterations, scenario.maxIterations ?? iterations);
      const s = summarize(await sequential(baseUrl, scenario, n));
      rows.push([
        scenario.id,
        scenario.requests.length,
        'sequential',
        s.n,
        ms(s.p50),
        ms(s.p95),
        ms(s.max),
      ]);
      if (scenario.concurrent) {
        const c = summarize(await concurrent(baseUrl, scenario, n));
        rows.push([
          scenario.id,
          scenario.requests.length,
          `batches of ${CONCURRENCY}`,
          c.n,
          ms(c.p50),
          ms(c.p95),
          ms(c.max),
        ]);
      }
      // POSTed rows must not grow the dataset that later scenarios read.
      await deleteWrittenRows(prisma);
      console.error(`${scenario.id} done`);
    }

    await new Promise((resolve) => setTimeout(resolve, STATS_FLUSH_MS));
    const report = [
      `# Endpoint latency (${label})`,
      '',
      `Generated ${new Date().toISOString()} by \`npm run perf:latency -- --label ${label}\` against ${baseUrl}.`,
      `Client-side milliseconds per request (response body fully read), after ${WARM_UP} warm-up calls.`,
      'Variants = request variants cycled through (different users, cursors, exercises or ranges).',
      '',
      markdownTable(['Scenario', 'Variants', 'Mode', 'n', 'p50 ms', 'p95 ms', 'max ms'], rows),
      '',
      '## Index usage during this pass (idx_scan since reset)',
      '',
      markdownTable(
        ['Table', 'Index', 'Scans', 'Size'],
        (await indexUsage(prisma)).map((i) => [i.table, i.index, i.scans, i.size]),
      ),
      '',
    ].join('\n');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `latency-${label}.md`), report);
    console.log(report);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ level: 'error', msg: 'perf:latency failed', error: String(error) }),
  );
  process.exitCode = 1;
});
