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

    // An ALIASED import is DEFINED under one name and READ under another, and the stale check
    // compares the ORIGINAL. What keeps that correct is the RESOLVED TARGET TAIL: the call binds to
    // `aliased-source.ts::originalname`, and the used-names index records the tail, so the original
    // spelling is present even though this file never writes it.
    //
    // That mechanism was load-bearing and untested. Mutating the target-tail line fails this case
    // and nothing else in the suite. Written after a redundant "also check the local name" guard was
    // added here, failed to bite under mutation, and was removed — the protection was never the
    // alias spelling, it was the resolved edge.
    writeFile(repo, 'src/aliased-source.ts', `
export function originalName(x: number): number { return x + 9; }
`);
    writeFile(repo, 'src/aliased-user.ts', `
import { originalName as localAlias } from './aliased-source.js';
export function useAlias(x: number): number { return localAlias(x); }
`);

    // ADR 0164 — an import routed through a BARREL resolves to the barrel's re-export node, whose
    // kind is `binding`, not to the declaration. `binding` was not a prunable kind, so no import
    // reached through a door could ever be judged stale — on a codebase built out of index doors
    // that is most of them. Measured on this repository: the single largest cause of the recall gap
    // against `tsc --noUnusedLocals`, 22 of 26 misses.
    writeFile(repo, 'src/behind-door.ts', `
export function behindDoor(x: number): number { return x + 11; }
export function alsoBehindDoor(x: number): number { return x + 12; }
`);
    writeFile(repo, 'src/door.ts', `
export { behindDoor, alsoBehindDoor } from './behind-door.js';
`);
    // Imports two names THROUGH the door and uses only one. The unused one must be reported.
    writeFile(repo, 'src/door-user.ts', `
import { behindDoor, alsoBehindDoor } from './door.js';
export function useOne(x: number): number { return behindDoor(x); }
`);

    // An `index.ts` that is a REAL MODULE, not a pure re-export file — which is what an index door
    // usually is in this codebase. Exempting every index from stale-import judgement cost five true
    // findings on this repository, so the exemption is `__init__.py` only. The symbol dead here must
    // still be reported even though the file is named index.
    writeFile(repo, 'src/feature/index.ts', `
import { behindDoor, alsoBehindDoor as unusedInIndex } from '../door.js';
export function featureEntry(x: number): number { return behindDoor(x); }
`);

    // ADR 0165 — the read positions that had no pattern, each found by a measured false positive
    // once `variable` became a prunable kind. A template substitution was six findings on
    // orchestrator (SITE_URL, used only as a substitution in six page files); a class field
    // initialiser was thirteen on this repository (every language pack holds its queries that way).
    writeFile(repo, 'src/reads.ts', `
export const TEMPLATED = 'x';
export const FIELD_INIT = 'y';
export const RETURNED = 'z';
`);
    writeFile(repo, 'src/read-shapes.ts', `
import { TEMPLATED, FIELD_INIT, RETURNED } from './reads.js';

export class Holder {
  public readonly held = FIELD_INIT;
}

export function templated(): string { return \`value: \${TEMPLATED}\`; }
export function returned(): string { return RETURNED; }
`);

    writeFile(repo, 'src/main.ts', `
import { realWork } from './importer.js';
import { viaBarrel } from './index.js';
import { spreadRead, indexRead } from './readers.js';
import { useAlias } from './aliased-user.js';
import { useOne } from './door-user.js';
import { featureEntry } from './feature/index.js';
import { Holder, templated, returned } from './read-shapes.js';
export function boot(): number {
  return realWork(1) + viaBarrel(2) + spreadRead().length + indexRead('ok') + useAlias(3) + useOne(4) + featureEntry(5) + new Holder().held.length + templated().length + returned().length;
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
  it('does not call an aliased import stale when the file uses the alias', () => {
    const hit = findings.filter((f: any) => f.file.includes('aliased-user'));
    expect(hit.map((f: any) => f.type)).not.toContain('STALE_IMPORT');
  }, 240000);

  it('reports an unused import that was routed through a barrel door', () => {
    const hit = findings.filter((f: any) => f.symbol === 'alsoBehindDoor');
    expect(hit.map((f: any) => f.type)).toContain('STALE_IMPORT');
  }, 240000);

  it('does not report the name from the SAME door that is used', () => {
    const hit = findings.filter(
      (f: any) => f.symbol === 'behindDoor' && f.file.includes('door-user'),
    );
    expect(hit.map((f: any) => f.type)).not.toContain('STALE_IMPORT');
  }, 240000);

  it('judges an index door like any other file — it is not a Python package init', () => {
    const hit = findings.filter((f: any) => f.file.includes('feature/index'));
    expect(hit.map((f: any) => f.type)).toContain('STALE_IMPORT');
  }, 240000);

  it.each([
    ['a template substitution', 'TEMPLATED'],
    ['a class field initialiser', 'FIELD_INIT'],
    ['a bare return', 'RETURNED'],
  ])('counts %s as a read of the binding', (_shape, symbol) => {
    const hit = findings.filter((f: any) => f.symbol === symbol);
    expect(hit.map((f: any) => f.type)).not.toContain('STALE_IMPORT');
  }, 240000);

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
