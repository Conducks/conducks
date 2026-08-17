/**
 * Conducks — the git feature's only door (ADR 0150).
 *
 * Everything outside `core/git` imports from HERE and from nothing deeper. The rule exists because a
 * feature reachable at many files cannot be changed without checking every one of them: parsing is
 * reached at 24 separate paths today, which is why its two largest files have never been split.
 * `core/git` is reached at one file, so this door is cheap to hold and worth holding early.
 *
 * `tests/unit/core/git/door.test.ts` fails when anything outside reaches past it.
 *
 * WHAT IS DELIBERATELY NOT HERE: nothing. The internals are one class and two free functions, and
 * every one of them has an external caller — so this door re-exports the whole surface rather than
 * pretending to narrow it. Narrowing happens when a symbol loses its last caller, not before.
 *
 * RULE 4, resolved (todo70). `chronicle` is exported as `ReadOnlyChronicle` — the class minus its
 * one mutator — so none of the twenty-four files holding it can re-anchor the process. Moving the
 * anchor is `anchorChronicle(root)`, a named operation used at three sites that all anchor at boot
 * or at a CLI target rather than wandering mid-run.
 *
 * What this does NOT claim: the instance is still shared, and `anchorChronicle` is still importable
 * by anyone. What it removes is the accidental case — a method reachable on every handed-out
 * reference — which is the one that actually happened.
 */
export { ChronicleInterface, chronicle, anchorChronicle, branchMismatch } from './chronicle-interface.js';
export type { ReadOnlyChronicle } from './chronicle-interface.js';
