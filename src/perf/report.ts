/** Pure helpers for the performance scripts: latency statistics, markdown output, auto_explain parsing. */

/** Nearest-rank percentile (p in 0..100). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of an empty sample');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

export interface LatencySummary {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

export function summarize(values: readonly number[]): LatencySummary {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: percentile(values, 100),
  };
}

/** Shortens text beyond `max` characters (a bulk insert prints tens of thousands of parameters). */
export function truncate(text: string, max: number): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}… (${text.length - max} more characters)`;
}

type Cell = string | number;

/** GitHub markdown table; columns whose cells are all numbers are right-aligned. */
export function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly Cell[])[],
): string {
  const cell = (value: Cell) => String(value).replace(/\|/g, '\\|');
  const numeric = headers.map(
    (_, i) => rows.length > 0 && rows.every((row) => typeof row[i] === 'number'),
  );
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `|${numeric.map((n) => (n ? '---:' : '---')).join('|')}|`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

export interface PlanScan {
  /** e.g. "Index Only Scan", "Parallel Seq Scan", "Bitmap Index Scan". */
  node: string;
  index: string | null;
  /** Null for a Bitmap Index Scan, which names only its index. */
  relation: string | null;
  /** Per loop, as EXPLAIN prints them (a parallel worker or a nested-loop iteration is one loop). */
  estimatedRows: number;
  actualRows: number;
  loops: number;
  /** Only Index Only Scans report heap fetches. */
  heapFetches: number | null;
}

export interface ExplainedStatement {
  durationMs: number;
  queryText: string;
  parameters: string | null;
  /** Buffers of the top plan node (the whole statement). */
  buffers: { hit: number; read: number };
  scans: PlanScan[];
  planText: string;
}

const PLAN_NODE = /\(cost=[\d.]+\.\.[\d.]+ rows=\d+ width=\d+\)/;
const SCAN =
  /^\s*(?:->\s+)?((?:Parallel )?(?:Index Only Scan|Index Scan|Bitmap Index Scan|Bitmap Heap Scan|Seq Scan)(?: Backward)?)(?: using (\S+))? on (\S+)(?: \S+)?\s+\(cost=[\d.]+\.\.[\d.]+ rows=(\d+) width=\d+\) (?:\(actual time=[\d.]+\.\.[\d.]+ rows=(\d+) loops=(\d+)\)|\(never executed\))/;

/** Reads one auto_explain notice (text format, log_analyze and log_buffers on). */
export function parseAutoExplain(message: string): ExplainedStatement {
  const lines = message.split('\n');
  const duration = /^duration: ([\d.]+) ms/.exec(lines[0] ?? '');
  if (!duration) throw new Error(`Not an auto_explain notice: ${lines[0]}`);

  const planStart = lines.findIndex((line, i) => i > 0 && /^\S/.test(line) && PLAN_NODE.test(line));
  if (planStart < 0) throw new Error('auto_explain notice without a plan');
  const header = lines.slice(1, planStart).join('\n');
  const parametersAt = header.indexOf('\nQuery Parameters: ');
  const queryText = (parametersAt >= 0 ? header.slice(0, parametersAt) : header)
    .replace(/^Query Text: /, '')
    .trim();
  const parameters =
    parametersAt >= 0 ? header.slice(parametersAt + '\nQuery Parameters: '.length).trim() : null;

  const planLines = lines.slice(planStart);
  const firstBuffers = planLines.find((line) => line.trim().startsWith('Buffers:')) ?? '';
  const scans: PlanScan[] = [];
  let current: PlanScan | null = null;
  for (const line of planLines) {
    const scan = SCAN.exec(line);
    if (scan) {
      const [, node, using, on, estimated, actual, loops] = scan as unknown as string[];
      const bitmapIndex = node === 'Bitmap Index Scan';
      current = {
        node: node as string,
        index: bitmapIndex ? (on as string) : (using ?? null),
        relation: bitmapIndex ? null : (on as string),
        estimatedRows: Number(estimated),
        actualRows: actual === undefined ? 0 : Number(actual),
        loops: loops === undefined ? 0 : Number(loops),
        heapFetches: null,
      };
      scans.push(current);
    } else if (PLAN_NODE.test(line)) {
      current = null;
    } else if (current) {
      const fetches = /Heap Fetches: (\d+)/.exec(line);
      if (fetches) current.heapFetches = Number(fetches[1]);
    }
  }

  return {
    durationMs: Number(duration[1]),
    queryText,
    parameters,
    buffers: {
      hit: Number(/hit=(\d+)/.exec(firstBuffers)?.[1] ?? 0),
      read: Number(/read=(\d+)/.exec(firstBuffers)?.[1] ?? 0),
    },
    scans,
    planText: planLines.join('\n'),
  };
}
