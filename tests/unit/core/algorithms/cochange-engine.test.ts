import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoChangeEngine } from '@/lib/core/algorithms/index.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';
import { SynapsePersistence } from '@/lib/core/persistence/index.js';

/**
 * The co-change engine finds files that change TOGETHER while nothing links them (ADR 0150 rule 10).
 *
 * It had zero statement coverage. That matters more here than in most files, because the whole
 * output is a claim about someone's architecture — "these two files are coupled and your code does
 * not say so" — and a wrong pair is indistinguishable from a right one to whoever reads the advice.
 *
 * Driven through the `historyExtractor` seam the constructor already offers, so the cases are about
 * the ANALYSIS and not about git. A real repository would test git's log format; the risk lives in
 * the join, the threshold and the structural check.
 *
 * THE THRESHOLD IS THE POINT. The SQL says `HAVING count > 3`: a pair must appear together in more
 * than three commits before it is reported at all. Two files touched in one commit is a coincidence,
 * and reporting it would bury the real findings in noise. Both sides of that line are asserted.
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const mkVault = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-cochange-'));
  tmp.push(d);
  return d;
};

/** A git log in the exact shape the engine asks for: `COMMIT:<hash>` then one file per line. */
const history = (commits: Array<string[]>): string =>
  commits.map((files, i) => [`COMMIT:h${i}`, ...files].join('\n')).join('\n');

/** N commits that all touch the same pair — the shape a real coupling has. */
const pairTouchedTimes = (n: number, a: string, b: string) =>
  history(Array.from({ length: n }, () => [a, b]));

const unit = (file: string) => ({
  id: `${file}::unit`, label: 'UNIT' as any,
  properties: { name: path.basename(file), filePath: file, canonicalKind: 'UNIT' } as any,
});

const run = async (log: string, graph: ConducksAdjacencyList, root: string) => {
  const p = new SynapsePersistence(mkVault());
  try {
    const db = await (p as any).getRawConnection();
    const engine = new CoChangeEngine(root, () => log);
    return await engine.discoverHiddenCoupling(graph, db);
  } finally {
    await p.close();
  }
};

describe('co-change reports a pair only when it is not already structural', () => {
  it('reports two files that change together with no edge between them', async () => {
    const root = '/repo';
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/repo/a.ts'));
    g.addNode(unit('/repo/b.ts'));

    const found = await run(pairTouchedTimes(6, 'a.ts', 'b.ts'), g, root);

    expect(found).toHaveLength(1);
    expect([found[0].fileA, found[0].fileB].sort()).toEqual(['/repo/a.ts', '/repo/b.ts']);
  }, 60000);

  it('stays SILENT below the four-commit threshold', async () => {
    // `HAVING count > 3`. Two files in one commit is a coincidence, and a tool that reported it
    // would drown its own real findings. Asserted at 3 — the last value that must produce nothing.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/repo/a.ts'));
    g.addNode(unit('/repo/b.ts'));

    expect(await run(pairTouchedTimes(3, 'a.ts', 'b.ts'), g, '/repo')).toHaveLength(0);
  }, 60000);

  it('confidence rises with the number of shared commits and never exceeds 1', async () => {
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/repo/a.ts'));
    g.addNode(unit('/repo/b.ts'));

    const few = await run(pairTouchedTimes(5, 'a.ts', 'b.ts'), g, '/repo');
    const many = await run(pairTouchedTimes(40, 'a.ts', 'b.ts'), g, '/repo');

    expect(few[0].confidence).toBeLessThan(many[0].confidence);
    expect(many[0].confidence).toBeLessThanOrEqual(1.0);
  }, 60000);

  it('says NOTHING about a pair the code already links — the whole point of the engine', async () => {
    // The engine reports HIDDEN coupling. Two files that change together AND import each other are
    // not a finding; they are a codebase working as intended, and reporting them would make the
    // advice worthless by volume.
    //
    // This case was added because mutation caught its absence: replacing `if (!hasEdge)` with
    // `if (true)` passed all five tests written before it. Every other case here uses a graph with
    // no edges, so none of them could ever have noticed.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/repo/a.ts'));
    g.addNode(unit('/repo/b.ts'));
    g.addEdge({
      id: 'e1', sourceId: '/repo/a.ts::unit', targetId: '/repo/b.ts::unit',
      type: 'IMPORTS' as any, confidence: 1.0, properties: {} as any,
    });

    expect(await run(pairTouchedTimes(6, 'a.ts', 'b.ts'), g, '/repo')).toHaveLength(0);
  }, 60000);

  it('reports nothing at all for an empty history', async () => {
    const g = new ConducksAdjacencyList();
    expect(await run('', g, '/repo')).toHaveLength(0);
  }, 60000);

  it('resolves each logged path against the project root', async () => {
    // git logs repo-relative paths and the graph holds absolute ones. Without the resolve the
    // structural check below compares `a.ts` against `/repo/a.ts` — never equal — so EVERY coupled
    // pair would be reported as hidden, including the ones the code plainly declares.
    const g = new ConducksAdjacencyList();
    g.addNode(unit('/repo/src/a.ts'));
    g.addNode(unit('/repo/src/b.ts'));

    const found = await run(pairTouchedTimes(6, 'src/a.ts', 'src/b.ts'), g, '/repo');

    expect(found[0].fileA.startsWith('/repo/')).toBe(true);
  }, 60000);
});
