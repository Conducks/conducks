import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A RENAMED import used as a bare value (`{ fn: localAlias }`, `export const x = localAlias`) built
 * its target from the LOCAL alias spelling instead of the ORIGINAL name the import actually declares
 * — the exact bug `call.ts` had already been fixed for on the CALL path (ADR 0085), reintroduced on
 * the reference-as-value path.
 *
 * `import { realFn as localAlias } from './a.js'` defines the node at `a.ts::realfn`. Reading
 * `localAlias` as a bare value produced an ACCESSES edge to `a.ts::localalias` — a node that does not
 * exist. The import then read as unreferenced, because the usage-evidence token recorded was
 * `localalias`, never `realfn`.
 *
 * MEASURED on the orchestrator benchmark subject: `trackAction as coreTrackAction`, used at
 * `packages/core/log/client/index.ts:90` as `trackAction: coreTrackAction`, produced a dangling edge.
 *
 * Found by an isolated research agent asked to root-cause the gap before any fix was written.
 */
describe('a renamed import used as a bare value resolves to its original declaration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('aliased-value-reference');

    writeFile(repo, 'src/a.ts', `
export function realFn(): number { return 1; }
export function otherFn(): number { return 2; }
`);
    writeFile(repo, 'src/main.ts', `
import { realFn as localAlias, otherFn } from './a.js';

export const obj = { fn: localAlias };
export function useOther(): number { return otherFn(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not report the renamed import as stale', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.map((f: any) => f.symbol)).not.toContain('realFn');
  }, 180000);

  it('impact finds the value-reference caller through the alias', () => {
    // The reference lands at FILE scope, not at the `obj` declaration specifically — an object
    // literal's properties are not scopes in the scope map, only function/class/method declarations
    // are. That is pre-existing, correct behaviour; what this test pins is that the edge exists and
    // targets the REAL declaration (`realFn`), not the dangling alias spelling.
    const impact = JSON.parse(runCli(['impact', 'realFn', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('main.ts');
  }, 180000);

  it('still reports a genuinely unused renamed import in a different file', () => {
    // The counter-test: a fix that stopped checking usage at all would silence this too.
    writeFile(repo, 'src/unused.ts', `
import { realFn as unusedAlias, otherFn } from './a.js';
export function onlyUsesOther(): number { return otherFn(); }
`);
    commit(repo, 'add a file with a genuinely unused renamed import');
    runCli(['analyze', '--yes'], { cwd: repo });

    const stale = JSON.parse(runCli(['prune', '--json', '--type', 'STALE_IMPORT'], { cwd: repo }).stdout);
    expect(stale.some((f: any) => f.symbol === 'realFn' && String(f.file).includes('unused.ts'))).toBe(true);
  }, 180000);
});
