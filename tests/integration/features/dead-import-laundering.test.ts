import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * AN UNUSED IMPORT LAUNDERED THE SYMBOL BEHIND IT — adding dead code LOWERED the dead-code count.
 *
 * Two rules met and left a hole between them. `ORPHAN` requires zero incoming references, so one
 * import edge silenced it. `STALE_IMPORT` would have caught the import instead, except its
 * import-site calibration skips any statement where nothing at all is used — which is always true
 * of a single-binding import. Neither rule reported anything.
 *
 * MEASURED on the scraper subject (todo77#P1 L2): adding one unused
 * `from foundation.paths import get_data_dir` took prune from 23 findings to 22 and made
 * `get_data_dir` — an ORPHAN a moment earlier — invisible to both checks. That is the shape a real
 * refactor leaves behind: the last caller is deleted, the import is left, and the symbol stops
 * being reported the day it actually died.
 *
 * Reported as ONLY_IMPORTED, a QUESTION rather than a verdict (ADR 0104). A delete verdict here
 * would rest on the used-names index, and that index is measurably not strong enough to carry one:
 * removing the calibration guard built on it produced 77 false findings on Python.
 */
describe('an unused import does not launder the symbol behind it', () => {
  let repo: string;
  let findings: any[];

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('dead-import-laundering');

    writeFile(repo, 'src/dead.ts', `
export function laundered(x: number): number { return x + 1; }
`);
    // Imports it and never mentions it again. Before the fix this edge was enough to silence the
    // ORPHAN, while being invisible to the stale-import check.
    writeFile(repo, 'src/importer.ts', `
import { laundered } from './dead.js';
export function realWork(x: number): number { return x * 2; }
`);

    // COUNTER-CASE 1 — a barrel imports in order to republish, so "never uses the name" is its
    // normal state. Without the barrel rule this produced 8 findings on scraper, every one a name
    // listed in an __init__.py __all__.
    writeFile(repo, 'src/barrelled.ts', `
export function viaBarrel(x: number): number { return x + 3; }
`);
    writeFile(repo, 'src/index.ts', `
import { viaBarrel } from './barrelled.js';
export { viaBarrel };
`);

    // COUNTER-CASE 2 and 3 — bare identifier reads that produced no edge at all, so the symbol read
    // as never used. Both were real false positives on the TS subjects before the grammar captured
    // them: PROVIDER_KEYS spread at sofie app.ts:267, ERROR_STATUS_MAP indexed at orchestrator
    // errors.ts:11.
    writeFile(repo, 'src/keys.ts', `
export const KEYS = ['a', 'b'] as const;
export const STATUS: Record<string, number> = { ok: 200 };
`);
    writeFile(repo, 'src/readers.ts', `
import { KEYS, STATUS } from './keys.js';
export function spreadRead(): string[] { return [...KEYS]; }
export function indexRead(k: string): number { return STATUS[k] || 500; }
`);

    writeFile(repo, 'src/main.ts', `
import { realWork } from './importer.js';
import { viaBarrel } from './index.js';
import { spreadRead, indexRead } from './readers.js';
export function boot(): number {
  return realWork(1) + viaBarrel(2) + spreadRead().length + indexRead('ok');
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
  }, 240000);

  afterAll(() => rmRepo(repo));

  const find = (symbol: string) => findings.filter((f: any) => f.symbol === symbol);

  it('reports the laundered symbol instead of losing it', () => {
    const hit = find('laundered');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].type).toBe('ONLY_IMPORTED');
  }, 240000);

  it('reports it as a QUESTION, never a delete verdict', () => {
    expect(find('laundered')[0].claim).toBe('question');
  }, 240000);

  it('does not flag a symbol a barrel imports in order to republish', () => {
    expect(find('viaBarrel').map((f: any) => f.type)).not.toContain('ONLY_IMPORTED');
  }, 240000);

  it('counts a spread as a read of the binding', () => {
    expect(find('KEYS').map((f: any) => f.type)).not.toContain('ONLY_IMPORTED');
  }, 240000);

  it('counts a subscript as a read of the object it indexes', () => {
    expect(find('STATUS').map((f: any) => f.type)).not.toContain('ONLY_IMPORTED');
  }, 240000);

  /**
   * ADR 0163. The import-site calibration guard skipped any statement where NOTHING it brings in was
   * used — which is true by construction of every SINGLE-BINDING import, so the commonest stale
   * import in any codebase was the one shape that could never be reported. todo77#P1 planted it
   * twice, on two languages, and prune missed it twice.
   */
  it('reports a single-binding unused import as stale', () => {
    expect(find('laundered').map((f: any) => f.type)).toContain('STALE_IMPORT');
  }, 240000);
});

/**
 * The barrel rule is a PYTHON rule, measured as such.
 *
 * In TypeScript a re-export is `export { x }`, which the grammar already captures as a use — so the
 * barrel exclusion is redundant there and mutating it away breaks nothing. Python states the
 * republish in `__all__`, a list of STRING literals that no reference rule reads, so an `__init__.py`
 * looks exactly like a file that imports a name and never touches it.
 *
 * MEASURED on scraper: without the exclusion this rule produced 11 findings and 8 were re-exports —
 * `get_logger`, `classify`, `classify_http`, `RetryDecision`, `BaseQueue` and three exception types.
 * The L3 counter-case for `prune` had named this shape in advance ("a name re-exported from
 * __init__.py must not be flagged"), which is how it was caught before shipping.
 */
describe('a Python package barrel imports in order to republish', () => {
  let repo: string;
  let findings: any[];

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('python-barrel');

    writeFile(repo, 'src/pkg/mod.py', `
def via_barrel(x):
    """Reached by consumers only through the package barrel."""
    return x + 1
`);
    // The republish is a string in __all__. Nothing here READS the name.
    writeFile(repo, 'src/pkg/__init__.py', `
from pkg.mod import via_barrel

__all__ = ["via_barrel"]
`);
    // Nothing downstream consumes it — the barrel is the ONLY referrer, which is the real shape
    // on the subject: a package publishes a name whose consumers are outside this repository, or
    // are not written yet. That is precisely why it must not be called dead.
    writeFile(repo, 'src/main.py', `
import pkg


def boot():
    return pkg
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
  }, 240000);

  afterAll(() => rmRepo(repo));

  it('does not report a name the barrel re-exports through __all__', () => {
    const hit = findings.filter((f: any) => f.symbol === 'via_barrel');
    expect(hit.map((f: any) => f.type)).not.toContain('ONLY_IMPORTED');
  }, 240000);

  /**
   * The same exclusion, on the other rule — and this is the one that PAID for retiring the
   * calibration guard. Measured on scraper: of 56 findings the Python oracle contradicted, 54 were
   * in an `__init__.py`. Naming the shape replaced a blanket guard that had cost every
   * single-binding import in both languages.
   */
  it('does not report the barrel import itself as stale', () => {
    const hit = findings.filter((f: any) => f.symbol === 'via_barrel');
    expect(hit.map((f: any) => f.type)).not.toContain('STALE_IMPORT');
  }, 240000);
});
