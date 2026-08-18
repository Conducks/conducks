import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A function-type expression's RETURN POSITION had no TYPE_REFERENCE capture.
 *
 * `(result: number) => ExecutionReport` never produced an edge to `ExecutionReport` — every OTHER
 * return-type shape already worked (`function f(): Report {}`, `(): Report` in a `type_annotation`),
 * because the grammar routes those through `type_annotation`, while a bare `function_type` node's
 * return sits under its own `return_type` field with no matching pattern.
 *
 * MEASURED on the sofie benchmark subject: `ExecutionReport`, imported and used ONLY via
 * `toReport?: (result: R) => ExecutionReport`, produced zero TYPE_REFERENCE edges. It shipped
 * without a false STALE_IMPORT only because of an unrelated calibration guard in
 * `dead-code.ts` — a change to that guard (tried and reverted separately) would have turned this
 * into a real false positive.
 *
 * Found by an isolated research agent asked to root-cause the gap before any fix was written.
 */
describe('a function-type expression\'s return position is a type reference', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('function-type-return-position');

    writeFile(repo, 'src/types.ts', `
export interface ExecutionReport { ok: boolean }
export interface TrulyUnused { x: number }
`);
    writeFile(repo, 'src/main.ts', `
import type { ExecutionReport, TrulyUnused } from './types.js';

/** The only use of ExecutionReport anywhere is inside this arrow function-type's return position. */
export function register(toReport: (result: number) => ExecutionReport): void {
  void toReport;
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not report a type used only in a function-type return position as dead', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.map((f: any) => f.symbol)).not.toContain('ExecutionReport');
  }, 180000);

  it('impact finds the caller through the function-type return position', () => {
    const impact = JSON.parse(runCli(['impact', 'ExecutionReport', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('register');
  }, 180000);

  it('still reports a genuinely unused sibling import in the same statement', () => {
    // The counter-test: a capture change that swallowed too much would silence this too.
    const findings = JSON.parse(runCli(['prune', '--json', '--type', 'STALE_IMPORT'], { cwd: repo }).stdout);
    expect(findings.map((f: any) => f.symbol)).toContain('TrulyUnused');
  }, 180000);
});
