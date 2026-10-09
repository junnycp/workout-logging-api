import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { setupApp } from '../app.setup';
import { envSchema } from '../config/env.schema';
import { createPgAdapter } from '../database/pg-adapter';
import { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '../generated/prisma/client';
import { loadPerfProfile } from '../perf/perf-profile';
import { ExplainedStatement, markdownTable, parseAutoExplain, truncate } from '../perf/report';
import {
  buildScenarios,
  deleteWrittenRows,
  indexUsage,
  PerfRequest,
  selectScenarios,
  send,
  tableSizes,
  urlOf,
} from '../perf/scenarios';

/**
 * Captures the query plans of every performance scenario as PostgreSQL actually executed them.
 * The real app runs in-process, but its PrismaService is a client on a dedicated pool whose sessions load
 * auto_explain (log_analyze, log_buffers, log_triggers); each statement's plan comes back to the client as a
 * NOTICE, so nothing is re-run or rebuilt from logged SQL. Production code is unchanged.
 *
 *   npm run perf:plans -- --label cold   # right after `docker compose restart postgres`
 *   npm run perf:plans -- --label warm
 *   npm run perf:plans -- --label single --only S   # only scenarios whose id starts with S
 *
 * Writes docs/perf/plans/<label>/<scenario>.txt (raw plans) and summary.md. Needs a superuser role (the
 * compose `workouts` user is one) and the perf dataset (`npm run seed:perf`). Timings are not latencies:
 * EXPLAIN ANALYZE instrumentation adds overhead; see perf:latency for those.
 */
const AUTO_EXPLAIN = [
  // Same session time zone as createPgAdapter (src/database/pg-adapter.ts).
  '-c TimeZone=UTC',
  '-c session_preload_libraries=auto_explain',
  '-c auto_explain.log_min_duration=0',
  '-c auto_explain.log_analyze=on',
  '-c auto_explain.log_buffers=on',
  '-c auto_explain.log_triggers=on',
  '-c auto_explain.log_level=info',
].join(' ');

const BIG_TABLES = new Set(['workout_entries', 'workout_sets']);
/** Query text and parameters kept per statement in the raw plan files. */
const MAX_TEXT = 2_000;

const describeRequest = (request: PerfRequest): string =>
  `${request.method} ${urlOf('http://api', request).replace('http://api', '')}` +
  (request.body === undefined ? '' : ` (body: ${JSON.stringify(request.body).length} bytes)`);

function rawPlanFile(
  title: string,
  request: PerfRequest,
  statements: ExplainedStatement[],
): string {
  return [
    `# ${title}`,
    describeRequest(request),
    `${statements.length} statements`,
    '',
    ...statements.flatMap((s, i) => [
      `## Statement ${i + 1}: ${s.durationMs} ms`,
      `Query: ${truncate(s.queryText, MAX_TEXT)}`,
      ...(s.parameters ? [`Parameters: ${truncate(s.parameters, MAX_TEXT)}`] : []),
      '',
      s.planText,
      '',
    ]),
  ].join('\n');
}

/** "Index Only Scan workout_sets_pr_covering_idx (est 38587 / actual 17712 x3, heap 0)" for the big tables. */
function bigTableScans(statements: ExplainedStatement[]): string {
  const scans = statements.flatMap((s) =>
    s.scans
      .filter((scan) => scan.relation !== null && BIG_TABLES.has(scan.relation))
      .map(
        (scan) =>
          `${scan.node} ${scan.index ?? scan.relation} (est ${scan.estimatedRows} / actual ${scan.actualRows}` +
          `${scan.loops > 1 ? ` x${scan.loops}` : ''}${scan.heapFetches === null ? '' : `, heap ${scan.heapFetches}`})`,
      ),
  );
  return [...new Set(scans)].join('<br>');
}

async function main(): Promise<void> {
  const { DATABASE_URL } = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const labelAt = process.argv.indexOf('--label');
  const label = labelAt >= 0 ? (process.argv[labelAt + 1] ?? 'warm') : 'warm';
  const outDir = join(process.env.PERF_OUT ?? 'docs/perf', 'plans', label);

  const notices: string[] = [];
  const pool = new Pool({ connectionString: DATABASE_URL, options: AUTO_EXPLAIN });
  pool.on('connect', (client) =>
    client.on('notice', (notice) => {
      if (notice.message?.startsWith('duration:')) notices.push(notice.message);
    }),
  );
  const explained = new PrismaClient({ adapter: new PrismaPg(pool) });
  const plain = new PrismaClient({ adapter: createPgAdapter(DATABASE_URL) });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(explained)
    .compile();
  const app = await setupApp(
    moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false }),
  );
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  let closed = false;
  const closeApp = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await app.close();
    await explained.$disconnect();
    if (!pool.ended) await pool.end().catch(() => undefined);
  };

  try {
    const profile = loadPerfProfile(process.env.PERF_PROFILE);
    const scenarios = selectScenarios(await buildScenarios(plain, profile), process.argv);
    await plain.$executeRawUnsafe('SELECT pg_stat_reset()');
    mkdirSync(outDir, { recursive: true });

    const rows: (string | number)[][] = [];
    for (const scenario of scenarios) {
      const request = scenario.requests[0];
      notices.length = 0;
      await send(baseUrl, request);
      const statements = notices.map(parseAutoExplain);
      writeFileSync(
        join(outDir, `${scenario.id}.txt`),
        rawPlanFile(scenario.title, request, statements),
      );
      const durations = statements.map((s) => s.durationMs);
      rows.push([
        scenario.id,
        statements.length,
        Number(durations.reduce((a, b) => a + b, 0).toFixed(2)),
        Number(Math.max(0, ...durations).toFixed(2)),
        statements.reduce((sum, s) => sum + s.buffers.hit, 0),
        statements.reduce((sum, s) => sum + s.buffers.read, 0),
        bigTableScans(statements) || '-',
      ]);
    }
    await deleteWrittenRows(plain);
    // Backends flush index statistics when they exit: close the explained pool before reading idx_scan.
    await closeApp();

    const summary = [
      `# Query plans (${label})`,
      '',
      `Generated ${new Date().toISOString()} by \`npm run perf:plans -- --label ${label}\`.`,
      'DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can',
      'run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.',
      '',
      markdownTable(
        [
          'Scenario',
          'Statements',
          'DB ms (sum)',
          'Slowest ms',
          'Buffers hit',
          'Buffers read',
          'Scans of the big tables',
        ],
        rows,
      ),
      '',
      '## Table sizes',
      '',
      markdownTable(
        ['Table', 'Rows', 'Heap', 'Indexes', 'Total'],
        (await tableSizes(plain)).map((t) => [t.table, t.rows, t.heap, t.indexes, t.total]),
      ),
      '',
      '## Index usage during this pass (idx_scan since reset)',
      '',
      markdownTable(
        ['Table', 'Index', 'Scans', 'Size'],
        (await indexUsage(plain)).map((i) => [i.table, i.index, i.scans, i.size]),
      ),
      '',
    ].join('\n');
    writeFileSync(join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally {
    await closeApp();
    await plain.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ level: 'error', msg: 'perf:plans failed', error: String(error) }));
  process.exitCode = 1;
});
