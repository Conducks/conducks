import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Kinetic domain: `conducks impact` and `conducks trace` (KineticService -> Weighted Dijkstra,
// CONDUCKS-6) driven end to end over a real call graph: `caller` calls `helper`.
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

  function resolveId(name: string): string {
    const rows = JSON.parse(
      runCli(['query', name, '--mode', 'template', '--template', 'find_by_name', '--json'], { cwd: repo }).stdout
    );
    const hit = rows.find((r: any) => r.name === name);
    if (!hit) throw new Error(`fixture setup broken: ${name} not found`);
    return hit.id;
  }

  it('upstream impact of helper includes its real caller', () => {
    const helperId = resolveId('helper');
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

    const lonelyId = resolveId('lonelyFn');
    const { stdout } = runCli(['impact', lonelyId, 'upstream', '--json'], { cwd: repo });
    const result = JSON.parse(stdout);
    expect(result.affectedCount).toBe(0);
  });

  it('trace follows the real execution path from caller into helper', () => {
    const callerId = resolveId('caller');
    const { combined } = runCli(['trace', callerId], { cwd: repo });
    expect(combined).toContain('helper');
  });

  it('impact shrinks once the real call site is removed (proves the graph reflects source, not a cache)', () => {
    const helperId = resolveId('helper');
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
