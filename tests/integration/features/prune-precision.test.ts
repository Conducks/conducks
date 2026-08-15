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
  dead: ['deadFunction', 'deadConstant',
    // A DEFAULT EXPORT NOBODY IMPORTS, so that teaching conducks to follow default imports cannot
    // quietly make every default export look alive.
    //
    // It does NOT prove the narrower claim that ALIASES is excluded from REFERENCE_EDGES: adding
    // ALIASES to that set leaves this entry passing, because the naming edge starts at a
    // `<file>::default` id no node carries and so never lands as an incoming reference. Measured,
    // not assumed — the first version of this comment asserted the stronger thing.
    'deadDefault',
    // A DEAD SYMBOL WHOSE NAME MERELY CONTAINS AN ENTRY-POINT WORD. `isEntryPoint` matched its five
    // names — main, index, app, handler, setup — as SUBSTRINGS, so `deadApprovalGate` was exempted
    // from both verdicts by the "App" inside "Approval". MEASURED across three subjects: 53 of
    // sofie's 887 exported names were caught this way, 21 of orchestrator's 656, and tightening the
    // match to equality turned 18 of them into findings the compiler agrees with, with no new
    // contradiction. Silence is never EXTRA, so no oracle could have surfaced this.
    'deadApprovalGate',
    // The COUNTER-TEST for lazy loading: a NAMED export of a lazily imported module. The dynamic
    // import states no symbol, so the only export it can justify is the default; sparing this one
    // too would be the namespace laundering the fix deliberately refuses.
    'lazyNamedButDead'],
  /** Reachable. Each one is reached by a DIFFERENT mechanism, named in the fixture below. */
  live: [
    'staticallyUsed', 'dynamicallyUsed', 'constructedDynamically', 'barrelUsed', 'usedConstant',
    // Four shapes measured wrong on subject-c, where nine of ten STALE_IMPORT findings were false and
    // every one told the reader to delete an import the code needs. Each is reached by a syntax the
    // grammar produced NO evidence for at all — not a weak signal, an absent one.
    'wiredInArray', 'wiredInTernary', 'Reason', 'Boxed',
    // Three more of the same class, found by running the fixed build against CONDUCKS ITSELF — the
    // subject that had been reporting them all along. A tool that cannot read its own source is the
    // strongest available evidence that the gap was in the grammar and not in one project's style.
    'ThrownError', 'Intersected', 'Constrained',
    // Three more, found by re-running the benchmark against the monorepo subject after the earlier
    // fixes. All three are ordinary React/TypeScript, and each was reported dead:
    //   `Role`        annotated as `...roles: (Role)[]`   — a parenthesised type
    //   `handleBack`  returned as `{ handleNext, handleBack }` — object shorthand
    //   `Card`        published by `export default Card`  — the reason the file exists
    'ParenTyped', 'shorthandUsed', 'defaultExported',
    // Two more from the third benchmark run, both ordinary JavaScript:
    //   `secondArg`  passed as the SECOND argument of a call — the kinesis pattern's `(_)*`
    //                quantifier captures only the first, so every later argument was invisible
    //   `fallbackFn` used as a destructuring DEFAULT (`{ x = fallbackFn } = opts`)
    'secondArg', 'fallbackFn',
    // Two more, found by scoring ORPHAN against the language service for the first time. Both are
    // FALLBACKS, and both were reported as never referenced while sitting on the line that uses them:
    //   nullishFallback  the right operand of ??  — the grammar captured only the right operand of
    //                    instanceof, and that narrow pattern read as if it covered binary_expression
    //   paramDefault     a DEFAULT PARAMETER VALUE (run: T = paramDefault)
    'nullishFallback', 'paramDefault',
    // A MODULE AUGMENTATION whose module does not resolve. `AugmentedMap` is merged into another
    // module, not declared here, so nothing referencing it is its normal state. The augmentation was
    // only recognised when the specifier RESOLVED, so augmenting a package, or a workspace outside
    // the analysed root, reported the merged type as ORPHAN.
    'AugmentedMap',
    // A DEFAULT IMPORT WHOSE LOCAL NAME DIFFERS from the exported one — the ordinary React/Next
    // shape, where a route imports the component beside it. Only NAMED specifiers had a per-binding
    // capture, so the local name was never registered, the call dangled, and the exported
    // declaration read as ORPHAN. The two names are joined through `default`.
    'liveDefault',
    // The SAME shape with the local name MATCHING the exported one, in a file that imports something
    // in-project. That combination regressed while the renamed form was being fixed: the default
    // import produces the target `<file>::default`, and the generic fallback answers a plain name by
    // searching the file's own imports — so once the file had an import, `default` resolved to
    // SOMEBODY ELSE'S default export. The renamed form kept passing throughout, which is why this
    // needs its own entry rather than trusting the one above.
    'sameNameDefault',
    // THE COUNTER-TEST for the entry above, and the case the tightened match must NOT eat. `handler`
    // is spared by the entry-name CONVENTION, not by reachability: nothing in the fixture references
    // it, and a framework would invoke it without importing it. It sits here because the assertion
    // this list drives is "not flagged", which is exactly the claim being made about it.
    'handler',
    // A DEFAULT EXPORT REACHED ONLY BY A DYNAMIC IMPORT THAT BINDS NO NAME — `React.lazy(() =>
    // import('./X'))`, the ordinary route- and plugin-splitting shape. Only the awaited,
    // destructured form was captured, so the file read as UNIMPORTED_MODULE; capturing the file
    // alone then turned it into a confident ORPHAN, which is worse. Both halves are needed, and
    // this entry fails if either is removed. MEASURED on subject-a: 18 plugin components.
    'lazyDefault',
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

// The four subject-c shapes. Each is a normal way to write working code.
export function wiredInArray(): number { return 8; }
export function wiredInTernary(): number { return 9; }
export enum Reason { Timeout = 'timeout' }
export interface Boxed<T> { value: T }
export class ThrownError extends Error {}
export interface Intersected { a: number }
export interface Constrained { b: number }
export function secondArg(): number { return 12; }
export function fallbackFn(): number { return 13; }
export interface ParenTyped { p: number }
export function shorthandUsed(): number { return 10; }
export function defaultExported(): number { return 11; }
export function nullishFallback(): number { return 14; }
export function paramDefault(): number { return 15; }

// The entry-name pair. Both are exported and referenced by nothing; only the NAME differs.
export function deadApprovalGate(): number { return 20; }
export function handler(): number { return 21; }
`);

    // A file that MERGES INTO a module the analysis cannot see. Deliberately an unresolvable
    // specifier: that is the case that broke, and a resolvable one passes either way. The file is
    // imported by main.ts on purpose — inside an UNIMPORTED file every symbol is reported as the
    // UNIMPORTED_MODULE question instead, which is not in VERDICT_TYPES and would make this shape
    // pass whether the augmentation is understood or not.
    writeFile(repo, 'src/augments.ts', `
export function augmentAnchor(): number { return 16; }

declare module 'a-package-not-in-this-project' {
  interface AugmentedMap { ['product:thing']: string }
}
`);

    // The two halves of the default-export shape. Separate files because a module has exactly one
    // default, and the local name on the importing side is deliberately NOT the exported name — that
    // difference is the whole defect.
    writeFile(repo, 'src/live-default.ts', `
export default function liveDefault(): number { return 17; }
`);
    // The in-project import is the condition, not decoration: without it the name-based fallback
    // has nothing to go wrong with and this file passes whether the hop is file-specific or not.
    writeFile(repo, 'src/same-name-default.ts', `
import { staticallyUsed } from './lib.js';
export default function sameNameDefault(): number { return 19 + staticallyUsed(); }
`);
    writeFile(repo, 'src/dead-default.ts', `
export default function deadDefault(): number { return 18; }
`);

    // A LAZILY LOADED component, and the counter-test beside it. Only the DEFAULT is reached — the
    // dynamic import binds no name, so nothing in the source states which symbol is consumed, and
    // `React.lazy`'s contract says it is the default. `lazyNamedButDead` sits in the same file and
    // must still be reported, or the fix would have spared every export of every lazily loaded
    // module instead of the one it can actually justify.
    writeFile(repo, 'src/lazy-view.ts', `
export default function lazyDefault(): number { return 22; }
export function lazyNamedButDead(): number { return 23; }
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
    //   3. the same, then CONSTRUCTED — subject-c's MacOSAdapter shape
    //   4. an import through a barrel re-export
    writeFile(repo, 'src/main.ts', `
import { staticallyUsed, usedConstant } from './lib.js';
import { barrelUsed } from './index.js';
import { augmentAnchor } from './augments.js';
import RenamedOnImport from './live-default.js';
import sameNameDefault from './same-name-default.js';
// imported for its side effects only, so the FILE is reachable and its default export is judged as
// a symbol rather than deferred as the UNIMPORTED_MODULE question
import './dead-default.js';

// A DYNAMIC IMPORT THAT BINDS NOTHING — the React.lazy shape, written without React so the fixture
// keeps no dependency. Nothing is awaited and nothing is destructured, which is exactly why the old
// capture (anchored on the variable_declarator of an awaited destructure) saw no import at all.
export const lazyView = () => import('./lazy-view.js');

export async function main(): Promise<number> {
  const a = staticallyUsed() + usedConstant;

  const { dynamicallyUsed } = await import('./lib.js');
  const b = dynamicallyUsed();

  const { constructedDynamically } = await import('./lib.js');
  const c = new constructedDynamically().run();

  return a + b + c + barrelUsed() + augmentAnchor() + RenamedOnImport() + sameNameDefault();
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
    // MEASURED on subject-c before the grammar fix: all four were reported. Six registrars sat in an
    // array exactly like `registrars` below and `prune` said to delete them — deleting any one
    // breaks the boot sequence. The import-site calibration could not save them, because the file
    // HAS observed uses; the blind spot is per-SHAPE, not per-file, which is why the fix belongs in
    // the grammar and not in another guard on top of it.
    // `staticallyUsed` is imported and CALLED on purpose, and the test is vacuous without it: the
    // import-site calibration skips a statement when NOTHING it brings in was seen being used, so a
    // file where all four shapes are invisible reports nothing at all and passes whether the grammar
    // covers them or not. MEASURED — this fixture passed against the unfixed build until the called
    // sibling was added. That sibling is not a convenience, it is the condition: subject-c's `app.ts`
    // had one (a type import from the same module), which is why the guard did not save it there.
    writeFile(repo, 'src/wiring.ts', `
import {
  wiredInArray, wiredInTernary, Reason, Boxed,
  ThrownError, Intersected, Constrained,
  ParenTyped, shorthandUsed,
  secondArg, fallbackFn,
  nullishFallback, paramDefault,
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

// 8. a PARENTHESISED type inside an array — the identifier sits one level below array_type
export function takesMany(...items: (ParenTyped)[]): number { return items.length; }

// 9. OBJECT SHORTHAND — how every hook returns its handlers
export const bundle = { shorthandUsed };

// 12. NULLISH FALLBACK - the right operand of ??. Every operator other than instanceof was invisible,
// so a fallback named on the same line as its consumer read as dead.
export function pickFn(opts: { fn?: () => number }): () => number { return opts.fn ?? nullishFallback; }

// 13. DEFAULT PARAMETER VALUE. TypeScript parses this as required_parameter, JavaScript as
// assignment_pattern - different nodes for the same code, which is why the pattern is split per
// grammar rather than shared.
export function runsWith(run: () => number = paramDefault): number { return run(); }

// 10. SECOND ARGUMENT of a call. The first argument has always resolved; anything after it did not.
export function subscribe(a: unknown, b: unknown): unknown { return [a, b]; }
export const wired = subscribe(staticallyUsed, secondArg);

// 11. DESTRUCTURING DEFAULT — the fallback a caller gets when the option is absent
export function withOpts(opts: { pick?: () => number } = {}): number {
  const { pick = fallbackFn } = opts;
  return pick();
}
`);
    // 10. DEFAULT EXPORT — the symbol a component file exists to publish.
    // `staticallyUsed` is imported and CALLED here for the same reason it is in `wiring.ts`: with
    // nothing in the statement observed being used, import-site calibration skips it entirely and
    // the assertion below can never fail. MEASURED — without this line the default-export case
    // passed against a build that did not capture default exports at all.
    writeFile(repo, 'src/default-export.ts', `
import { defaultExported, staticallyUsed } from './lib.js';

export const ping = staticallyUsed();
export default defaultExported;
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
    // findings on subject-c were reached this way, and a combined precision number would let this
    // regress while the total still looked healthy.
    expect(flagged.has('dynamicallyUsed')).toBe(false);
    expect(flagged.has('constructedDynamically')).toBe(false);
  });

  it('does not call a binding stale because of HOW it is used — the four subject-c shapes', () => {
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
      parenthesisedType: stale.has('ParenTyped'),
      objectShorthand: stale.has('shorthandUsed'),
      defaultExport: stale.has('defaultExported'),
      secondCallArgument: stale.has('secondArg'),
      destructuringDefault: stale.has('fallbackFn'),
    }).toEqual({
      arrayLiteral: false,
      ternaryBranch: false,
      enumMemberRead: false,
      arrayOfGeneric: false,
      instanceofOperand: false,
      intersectionType: false,
      conditionalType: false,
      parenthesisedType: false,
      objectShorthand: false,
      defaultExport: false,
      secondCallArgument: false,
      destructuringDefault: false,
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
