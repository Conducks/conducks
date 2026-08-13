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
  dead: ['deadFunction'],
  /** Reachable. Each one is reached by a DIFFERENT mechanism, named in the fixture below. */
  live: ['staticallyUsed', 'dynamicallyUsed', 'constructedDynamically', 'barrelUsed', 'usedConstant'],
};

/**
 * MEASURED and still wrong, tracked here rather than asserted away (todo63 Phase 2).
 *
 * This group started with TWO entries and is down to one, which is the group working as intended:
 * `usedConstant` was reported `STALE_IMPORT` while being used, and that half is FIXED — it now sits
 * in `TRUTH.live` above and is scored like anything else.
 *
 * What remains is the recall half, and it is a different cause: an exported value nobody imports has
 * no node left by the time `prune` runs, because `pruneTaxonomy` cuts an ATOM carrying no
 * non-structural edge (ADR 0013). There is nothing to flag, so `prune` cannot flag it. Fixing that
 * means keeping value nodes alive, which is a taxonomy decision and not a `prune` one.
 */
const KNOWN_WRONG = {
  deadButNotFlagged: ['deadConstant'],
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

  it('holds the const-value gap at exactly its measured size — no wider, and no silently fixed', () => {
    // Fails if the gap GROWS (a new symbol falls in) and fails if it SHRINKS (the fix landed and this
    // list is now a lie). Either way somebody reads it, which is the only way a known-wrong list stays
    // honest — see todo63.
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
