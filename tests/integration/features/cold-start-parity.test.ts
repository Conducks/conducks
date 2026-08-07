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
 * This pins the property rather than the numbers: cold and force must agree, per edge type, so a
 * future change cannot restore the gap quietly.
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
    commit(repo, 'cross-file shapes');
  });

  afterAll(() => rmRepo(repo));

  const counts = (): { nodes: number; edges: number } => {
    const out = runCli(['status', '--json'], { cwd: repo }).stdout;
    const j = JSON.parse(out);
    return { nodes: Number(j.nodes ?? j.nodeCount), edges: Number(j.edges ?? j.edgeCount) };
  };

  it('the first analyze and a forced rebuild agree on node AND edge counts', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const cold = counts();

    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const rebuilt = counts();

    // Reported together so a failure names the gap rather than only asserting one number.
    expect({ phase: 'cold', ...cold }).toEqual({ phase: 'cold', ...rebuilt });
  });
});
