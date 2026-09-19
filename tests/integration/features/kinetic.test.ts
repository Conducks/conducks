import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Kinetic domain: `conducks impact` and `conducks trace` (KineticService -> Weighted Dijkstra,
// see docs/visuals/modules/domain/kinetic.md) driven end to end over a real call graph:
// `caller` calls `helper`.
describe('Kinetic domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('kinetic');
    writeFile(repo, 'src/chain.ts', `
export function helper(x: number): number {
  return x + 1;
}
export function caller(x: number): number {
  return helper(x) * 2;
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  /**
   * The partial id form — `path::name` — which every command accepts.
   *
   * This used to run the `query` command to look an id up, which made five `impact` and `trace`
   * cases depend on a THIRD tool that is not under test here: deleting or breaking `query` would
   * have failed this file for a reason that has nothing to do with the kinetic domain. Same shape
   * as `drift`'s tests calling `conducks rename` to manufacture a renamed symbol, which is what
   * broke them when ADR 0156 removed that command.
   *
   * The test for whether a fixture command is legitimate: is it the only way to produce this state?
   * `analyze` is — nothing else writes the vault. `query` is not — the fixture already knows which
   * file it wrote each symbol into.
   */
  const idOf = (file: string, name: string) => `${file}::${name}`;

  it('upstream impact of helper includes its real caller', () => {
    const helperId = idOf('src/chain.ts', 'helper');
    const { stdout } = runCli(['impact', helperId, 'upstream', '--json'], { cwd: repo });
    const result = JSON.parse(stdout);
    expect(result.affectedNodes.some((n: any) => n.name === 'caller')).toBe(true);
    expect(result.affectedCount).toBeGreaterThan(0);
  });

  // Assertion can fail: a symbol with no callers must show zero upstream impact.
  it('upstream impact of an unrelated, uncalled symbol is empty (proves impact is not always positive)', () => {
    writeFile(repo, 'src/lonely.ts', `export function lonelyFn(): void {}`);
    commit(repo, 'add lonely');
    runCli(['analyze', '--yes', '--force'], { cwd: repo });

    const lonelyId = idOf('src/lonely.ts', 'lonelyFn');
    const { stdout } = runCli(['impact', lonelyId, 'upstream', '--json'], { cwd: repo });
    const result = JSON.parse(stdout);
    expect(result.affectedCount).toBe(0);
  });

  it('trace follows the real execution path from caller into helper', () => {
    const callerId = idOf('src/chain.ts', 'caller');
    const { combined } = runCli(['trace', callerId], { cwd: repo });
    expect(combined).toContain('helper');
  });

  it('impact shrinks once the real call site is removed (proves the graph reflects source, not a cache)', () => {
    const helperId = idOf('src/chain.ts', 'helper');
    let { stdout } = runCli(['impact', helperId, 'upstream', '--json'], { cwd: repo });
    const before = JSON.parse(stdout).affectedCount;
    expect(before).toBeGreaterThan(0);

    // Remove the call site entirely.
    writeFile(repo, 'src/chain.ts', `
export function helper(x: number): number {
  return x + 1;
}
export function caller(x: number): number {
  return x * 2;
}
`);
    commit(repo, 'remove call');
    runCli(['analyze', '--yes', '--force'], { cwd: repo });

    ({ stdout } = runCli(['impact', helperId, 'upstream', '--json'], { cwd: repo }));
    const after = JSON.parse(stdout).affectedCount;
    expect(after).toBeLessThan(before);
  });
});
