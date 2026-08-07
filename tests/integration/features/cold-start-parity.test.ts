import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A repository's FIRST analyze must produce the same graph as the second.
 *
 * MEASURED on all three frozen subjects, cold (no vault at all) then `--force` over the result:
 *
 *   scraper       5,294 / 17,285  ->  5,294 / 17,342   (+57 edges)
 *   orchestrator  6,647 / 23,701  ->  6,647 / 23,797   (+96 edges)
 *   sofie        10,546 / 34,683  -> 10,545 / 34,931   (-1 node, +248 edges)
 *
 * Node counts agree; edges do not. So anyone who analyzes a repository for the first time — which is
 * everyone, once — gets a graph missing edges, with nothing saying so, and only a second run fills
 * them in. `impact` and `trace` answer from those edges, so the first answers a new user ever sees
 * are the weakest ones the tool will give them.
 *
 * WHAT THIS TEST DOES AND DOES NOT PROVE — stated because the first version of it proved nothing
 * and looked like it did.
 *
 * It asserts the PROPERTY: a first analyze and a rebuild agree on node and edge counts. It does NOT
 * reproduce the handover gap that motivated it. Mutation-checked twice: reverting the fix in
 * `bindPulseCircuits` leaves this test GREEN, both before and after the fixture gained an
 * external-symbol variable handover. Whatever conditions the induced-endpoint race needs, five
 * files do not create them.
 *
 * The fix is proven on the FROZEN PYTHON SUBJECT instead, where the gap was measured: a cold analyze
 * went from 6 handovers / 17,285 edges to 63 / 17,342 — byte-identical to the warm answer — and all
 * three subjects now build their warm baselines from an empty vault. That measurement is the
 * evidence; this test is a cheap guard against a DIFFERENT regression reintroducing a count gap.
 *
 * It also carries a NaN guard, because the first version read `j.nodeCount` where the payload has
 * `j.stats.nodeCount`, got NaN for both sides, and `toEqual` treats NaN as equal to itself. It
 * compared nothing to nothing and passed.
 */
describe('cold start produces the same graph as a rebuild', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('coldstart');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'cold', version: '1.0.0', type: 'module' }));
    // Shapes that need CROSS-FILE resolution, which is where a first pass is most likely to be thin:
    // an import used as a value, a type-only import, a class extended from another file, and a call
    // through an imported symbol.
    writeFile(repo, 'src/base.ts', 'export class Base { run(): number { return 1; } }\nexport interface Shape { area(): number; }\n');
    writeFile(repo, 'src/util.ts', 'export function helper(n: number): number { return n + 1; }\n');
    writeFile(repo, 'src/app.ts', `
import { Base, Shape } from './base.js';
import { helper } from './util.js';

export class App extends Base {
  measure(s: Shape): number { return helper(s.area()); }
}
`);
    // A VARIABLE HANDOVER whose endpoints are EXTERNAL symbols — the exact shape the cold-start gap
    // lived in. `readFileSync` produces a value bound to `data`, which is then passed to
    // `writeFileSync`; both are induced library symbols, and induction runs AFTER the binder. A
    // fixture without this passes the parity assertion vacuously, which is how the first version of
    // this test survived the bug it was written for.
    writeFile(repo, 'src/io.ts', `
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function backup(p: string): void {
  const data = readFileSync(p, 'utf8');
  writeFileSync(p + '.bak', data);
}

export function digest(p: string): string {
  const raw = readFileSync(p, 'utf8');
  const h = createHash('sha256');
  h.update(raw);
  return h.digest('hex');
}
`);
    commit(repo, 'cross-file shapes');
  });

  afterAll(() => rmRepo(repo));

  /**
   * Counts live under `stats`, not at the top level — and reading the wrong key returned NaN, which
   * `toEqual` treats as equal to itself. So this test compared NaN to NaN and passed for months
   * without ever reading a number. The guard below is the fix for the CLASS, not just the key: a
   * count that is not a finite number fails loudly instead of silently agreeing with itself.
   */
  const counts = (): { nodes: number; edges: number } => {
    const j = JSON.parse(runCli(['status', '--json'], { cwd: repo }).stdout);
    const nodes = Number(j?.stats?.nodeCount);
    const edges = Number(j?.stats?.edgeCount);
    if (!Number.isFinite(nodes) || !Number.isFinite(edges)) {
      throw new Error(`status --json gave no usable counts: ${JSON.stringify(j?.stats)}`);
    }
    return { nodes, edges };
  };

  it('the first analyze and a forced rebuild agree on node AND edge counts', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const cold = counts();

    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const rebuilt = counts();

    // Reported together so a failure names the gap rather than only asserting one number.
    expect({ phase: 'cold', ...cold }).toEqual({ phase: 'cold', ...rebuilt });
    expect(cold.edges).toBeGreaterThan(0);
  });
});
