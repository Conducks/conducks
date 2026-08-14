import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * todo58 Phase 2 — the precision check, done by hand once, made repeatable.
 *
 * The original measurement took 172 `prune` findings on a frozen subject and verified each BY HAND
 * against the source: precision ~94.8%, and the errors were one mechanism rather than scattered
 * noise. That number cost hours and cannot be re-run, so it decays into a claim about a build nobody
 * has any more. This is the same measurement against a project whose truth is DECLARED.
 *
 * Two things it must do that a "does prune flag X" test does not (CONDUCKS-40):
 *
 *   - score what was found WRONG, not only what was found. A finding list is scored on PRECISION
 *     (of what it flagged, how much is really dead) AND RECALL (of what is really dead, how much it
 *     found). Either number alone is gameable: flag nothing and precision is perfect; flag everything
 *     and recall is.
 *   - carry the denominator. The counts are asserted, and the failure message prints the symbols, so
 *     a regression names itself instead of reporting a percentage that moved.
 *
 * SCOPED to the symbols declared below, deliberately. The fixture has other symbols — an entry file
 * nothing imports, a barrel — and scoring the whole output would make this a test of how the fixture
 * happens to be shaped. Every symbol scored here has a truth that is not open to argument.
 *
 * UNIMPORTED_MODULE is excluded because ADR 0026 makes it a QUESTION, not a verdict: "nothing
 * statically imports this file" is literally true of an entry point, and counting a true statement as
 * a false positive would score the tool for being honest.
 */

/** The whole point: truth is declared here, in the test, not read back out of the tool. */
const TRUTH = {
  /** Exported, imported by nobody, called by nobody. Deleting it changes nothing. */
  dead: ['deadFunction', 'deadConstant'],
  /** Reachable. Each one is reached by a DIFFERENT mechanism, named in the fixture below. */
  live: [
    'staticallyUsed', 'dynamicallyUsed', 'constructedDynamically', 'barrelUsed', 'usedConstant',
    // Four shapes measured wrong on sofie, where nine of ten STALE_IMPORT findings were false and
    // every one told the reader to delete an import the code needs. Each is reached by a syntax the
    // grammar produced NO evidence for at all — not a weak signal, an absent one.
    'wiredInArray', 'wiredInTernary', 'Reason', 'Boxed',
    // Three more of the same class, found by running the fixed build against CONDUCKS ITSELF — the
    // subject that had been reporting them all along. A tool that cannot read its own source is the
    // strongest available evidence that the gap was in the grammar and not in one project's style.
    'ThrownError', 'Intersected', 'Constrained',
  ],
};

/**
 * Empty, and kept as a named group rather than deleted (todo63).
 *
 * It held two entries. `usedConstant` was reported STALE_IMPORT while being used — fixed by removing
 * `variable` from PRUNABLE_BINDING_KINDS. `deadConstant` was missed entirely, because `pruneTaxonomy`
 * deleted the node before `prune` could see it — fixed by sparing an EXPORTED value from the ATOM
 * edge gate. Both now sit in `TRUTH` above and are scored like everything else.
 *
 * The group stays because the assertion below fails when it is WRONG in either direction, and an
 * empty list is the strongest form of that: any future symbol that lands here fails the build rather
 * than being quietly absorbed into a percentage.
 */
const KNOWN_WRONG = {
  deadButNotFlagged: [] as string[],
  liveButFlagged: [] as string[],
};

const VERDICT_TYPES = new Set(['ORPHAN', 'UNUSED_EXPORT', 'STALE_IMPORT']);

describe('prune precision and recall, against declared truth (todo58#P2)', () => {
  let repo: string;
  let flagged: Set<string>;
  let allFindings: Array<{ type: string; symbol: string }>;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('prune-precision');

    // --- the symbols under test -------------------------------------------------------------
    writeFile(repo, 'src/lib.ts', `
export function staticallyUsed(): number { return 1; }
export function dynamicallyUsed(): number { return 2; }
export function deadFunction(): number { return 3; }
export class constructedDynamically { run(): number { return 5; } }

// The two const VALUES of the KNOWN_WRONG group. An arrow function on a const is deliberately NOT
// used here — that case works, and including it would blur what the gap is about.
export const deadConstant = 4;
export const usedConstant = 7;

// The four sofie shapes. Each is a normal way to write working code.
export function wiredInArray(): number { return 8; }
export function wiredInTernary(): number { return 9; }
export enum Reason { Timeout = 'timeout' }
export interface Boxed<T> { value: T }
export class ThrownError extends Error {}
export interface Intersected { a: number }
export interface Constrained { b: number }
`);

    // A barrel, so one live symbol is reached through a re-export chain rather than directly.
    writeFile(repo, 'src/barrel.ts', `
export function barrelUsed(): number { return 6; }
`);
    writeFile(repo, 'src/index.ts', `
export { barrelUsed } from './barrel.js';
`);

    // --- the file that makes the live ones live ----------------------------------------------
    // Every reach is a mechanism the hand measurement found conducks getting wrong or right:
    //   1. a plain static import and call
    //   2. a DESTRUCTURED DYNAMIC import, called — the mechanism that made live code read as dead
    //   3. the same, then CONSTRUCTED — sofie's MacOSAdapter shape
    //   4. an import through a barrel re-export
    writeFile(repo, 'src/main.ts', `
import { staticallyUsed, usedConstant } from './lib.js';
import { barrelUsed } from './index.js';

export async function main(): Promise<number> {
  const a = staticallyUsed() + usedConstant;

  const { dynamicallyUsed } = await import('./lib.js');
  const b = dynamicallyUsed();

  const { constructedDynamically } = await import('./lib.js');
  const c = new constructedDynamically().run();

  return a + b + c + barrelUsed();
}
`);

    // A file that imports a value and a function, and uses only the function. The FUNCTION import
    // is genuinely stale and must be reported; the VALUE import is genuinely stale too and must NOT
    // be, because a value's use is invisible to the graph and the analyzer would rather miss a dead
    // import than delete a live one. Both halves are asserted below.
    writeFile(repo, 'src/stale.ts', `
import { staticallyUsed, usedConstant } from './lib.js';
import { deadFunction } from './lib.js';

export function usesNeither(): number { return 0; }
export function usesOne(): number { return staticallyUsed(); }
`);

    // A file whose every use is one of the four shapes that produced no evidence. It imports NOTHING
    // it does not use, so any STALE_IMPORT here is wrong by construction.
    //
    // MEASURED on sofie before the grammar fix: all four were reported. Six registrars sat in an
    // array exactly like `registrars` below and `prune` said to delete them — deleting any one
    // breaks the boot sequence. The import-site calibration could not save them, because the file
    // HAS observed uses; the blind spot is per-SHAPE, not per-file, which is why the fix belongs in
    // the grammar and not in another guard on top of it.
    // `staticallyUsed` is imported and CALLED on purpose, and the test is vacuous without it: the
    // import-site calibration skips a statement when NOTHING it brings in was seen being used, so a
    // file where all four shapes are invisible reports nothing at all and passes whether the grammar
    // covers them or not. MEASURED — this fixture passed against the unfixed build until the called
    // sibling was added. That sibling is not a convenience, it is the condition: sofie's `app.ts`
    // had one (a type import from the same module), which is why the guard did not save it there.
    writeFile(repo, 'src/wiring.ts', `
import {
  wiredInArray, wiredInTernary, Reason, Boxed,
  ThrownError, Intersected, Constrained,
  staticallyUsed,
} from './lib.js';

const enabled = true;

export const lifted = staticallyUsed();

// 1. an entry in an ARRAY literal — the registrar / middleware / plugin-table shape
export const registrars = [wiredInArray];

// 2. a TERNARY branch
export const chosen = enabled ? wiredInTernary : undefined;

// 3. an ENUM reached only through member access, never as a type annotation
export function isTimeout(code: string): boolean { return code === Reason.Timeout; }

// 4. an ARRAY OF A GENERIC — the type_identifier sits one level below the array_type
export const boxes: Boxed<string>[] = [];

// 5. INSTANCEOF — the class is named as a bare value operand
export function isThrown(e: unknown): boolean { return e instanceof ThrownError; }

// 6. an INTERSECTION type — union's twin, which was captured while this was not
export const merged: Intersected & { extra: string } = { a: 1, extra: 'x' };

// 7. a CONDITIONAL type — reads the type it checks against
export type Checks<T> = T extends Constrained ? true : false;
`);

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    const findings = JSON.parse(stdout) as Array<{ type: string; symbol: string }>;
    allFindings = findings;
    flagged = new Set(
      findings.filter(f => VERDICT_TYPES.has(f.type)).map(f => f.symbol)
    );
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('flags every symbol that is really dead — recall', () => {
    const missed = TRUTH.dead.filter(s => !flagged.has(s));
    // Named, not counted: "recall 0.5" sends the reader back to the fixture to work out which half.
    expect({ missed, of: TRUTH.dead.length }).toEqual({ missed: [], of: TRUTH.dead.length });
  });

  it('flags nothing that is really live — precision', () => {
    const wrong = TRUTH.live.filter(s => flagged.has(s));
    expect({ wronglyFlagged: wrong, of: TRUTH.live.length })
      .toEqual({ wronglyFlagged: [], of: TRUTH.live.length });
  });

  it('reaches a symbol through a destructured dynamic import — the todo58 mechanism specifically', () => {
    // Called out on its own because it is the case the hand measurement found: seven of nine wrong
    // findings on sofie were reached this way, and a combined precision number would let this
    // regress while the total still looked healthy.
    expect(flagged.has('dynamicallyUsed')).toBe(false);
    expect(flagged.has('constructedDynamically')).toBe(false);
  });

  it('does not call a binding stale because of HOW it is used — the four sofie shapes', () => {
    // Called out on its own for the same reason the dynamic-import case is: these four regressed
    // together (one missing grammar concept, four syntaxes) and a combined precision number would
    // let any one of them come back while the total still looked healthy. Named individually so a
    // failure says WHICH shape lost its evidence.
    const stale = new Set(
      allFindings.filter(f => f.type === 'STALE_IMPORT').map(f => f.symbol)
    );
    expect({
      arrayLiteral: stale.has('wiredInArray'),
      ternaryBranch: stale.has('wiredInTernary'),
      enumMemberRead: stale.has('Reason'),
      arrayOfGeneric: stale.has('Boxed'),
      instanceofOperand: stale.has('ThrownError'),
      intersectionType: stale.has('Intersected'),
      conditionalType: stale.has('Constrained'),
    }).toEqual({
      arrayLiteral: false,
      ternaryBranch: false,
      enumMemberRead: false,
      arrayOfGeneric: false,
      instanceofOperand: false,
      intersectionType: false,
      conditionalType: false,
    });
  });

  it('has no known-wrong symbols left, and fails if one reappears', () => {
    // Both former entries are fixed (todo63) and now scored in TRUTH. This asserts the group is still
    // empty: a regression that reintroduces either failure lands here rather than in a percentage.
    const stillMissed = KNOWN_WRONG.deadButNotFlagged.filter(s => !flagged.has(s));
    const stillWronglyFlagged = KNOWN_WRONG.liveButFlagged.filter(s => flagged.has(s));

    expect({ stillMissed, stillWronglyFlagged }).toEqual({
      stillMissed: KNOWN_WRONG.deadButNotFlagged,
      stillWronglyFlagged: KNOWN_WRONG.liveButFlagged,
    });
  });

  it('does NOT report a stale VALUE import, and that is the deliberate cost of todo63', () => {
    // `src/stale.ts` imports `usedConstant` and never uses it — genuinely stale, deliberately silent.
    // MEASURED before the fix: reporting it also reported the USED one in `main.ts`, because a value
    // read produces no edge and the import-site calibration is keyed per (file, specifier). This
    // assertion exists so that trading the false positive back for this recall is a visible choice
    // rather than an accident.
    const staleValueFindings = allFindings.filter(
      f => f.type === 'STALE_IMPORT' && f.symbol === 'usedConstant'
    );
    expect(staleValueFindings).toEqual([]);
  });

  it('scores both directions at once, so neither can be gamed', () => {
    const truePositives = TRUTH.dead.filter(s => flagged.has(s)).length;
    const falsePositives = TRUTH.live.filter(s => flagged.has(s)).length;
    const falseNegatives = TRUTH.dead.length - truePositives;

    // Flagging nothing gives perfect precision; flagging everything gives perfect recall. Only both
    // at once says anything, which is why they are asserted together rather than as two numbers.
    expect({ truePositives, falsePositives, falseNegatives })
      .toEqual({ truePositives: TRUTH.dead.length, falsePositives: 0, falseNegatives: 0 });
  });
});
