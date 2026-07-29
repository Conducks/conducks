import { logger } from "@/lib/core/utils/logger.js";

/**
 * Print where a pulse's memory actually is, when `CONDUCKS_MEM_TRACE` is set.
 *
 * A 446-unit pulse peaks above a gigabyte while the source it reads is 1.4 MB, and FIVE separate
 * explanations of that were written down before anything was measured and every one was wrong:
 * pinned rows, wave size, holding the source, the JavaScript heap, and the twelve eagerly-loaded
 * grammars (14 MB in total, measured one at a time).
 *
 * What is established is that it is NOT the JavaScript heap — the same pulse succeeds under
 * `--max-old-space-size=400` and still peaks above a gigabyte — so the number that matters is
 * `rss - heapTotal - external`, the native footprint. `ps` cannot see that split from outside, and
 * a guess cannot be falsified without it.
 *
 * Off unless asked for, because a pulse should not pay for a diagnostic.
 *
 * It deliberately does NOT ask DuckDB for its own accounting. `SELECT ... FROM duckdb_memory()` on
 * the pulse connection while the transaction is open kills the process with an INTERNAL assertion
 * inside `PipelineExecutor` — reproduced on the first attempt at writing this.
 */
export function traceMemory(label: string): void {
  if (!process.env.CONDUCKS_MEM_TRACE) return;
  const mb = (n: number) => Math.round(n / 1048576);
  const m = process.memoryUsage();
  const native = mb(m.rss) - mb(m.heapTotal) - mb(m.external);
  logger.info(`🛡️ [MemTrace] ${label} — rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB ` +
    `heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB native=${native}MB`);
}
