import { describe, it, expect } from '@jest/globals';
import { DuckDBInstance } from '@duckdb/node-api';
import { CoChangeEngine } from '@/lib/core/algorithms/cochange-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * Two runs on one connection must give the same answer (state-machine audit P-03-7). The history went
 * into a TEMPORARY table created `IF NOT EXISTS` and never emptied, so the second run inserted every
 * (commit, file) pair again and every co-change count doubled — a pair that changed together 2 times
 * crossed the `> 3` threshold on the second run.
 */
describe('co-change on a reused connection', () => {
  it('counts the same the second time', async () => {
    const history = ['c1', 'c2'].map(h => `COMMIT:${h}\na.ts\nb.ts`).join('\n');
    const engine = new CoChangeEngine('/p', () => history);
    const db = await (await DuckDBInstance.create(':memory:')).connect();
    const graph = new ConducksAdjacencyList();
    const first = await engine.discoverHiddenCoupling(graph, db);
    const second = await engine.discoverHiddenCoupling(graph, db);
    expect(first).toEqual([]);
    expect(second).toEqual(first);
  });
});
