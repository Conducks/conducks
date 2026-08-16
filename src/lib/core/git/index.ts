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
 * KNOWN TENSION, recorded rather than fixed. ADR 0150 rule 4 says a door exports operations and
 * types and never a mutable singleton — and `chronicle` is exactly that: a module-level instance
 * whose `setProjectDir` any caller may call. Seven of the eight importers want precisely that
 * instance, so changing it is a behaviour change, which rule 16 forbids inside a clean. It is
 * carried here, named, and left for its own decision with its own measurement.
 */
export { ChronicleInterface, chronicle, branchMismatch, branchRefusalMessage } from './chronicle-interface.js';
export type { ResolvedTarget, BranchMismatch } from './chronicle-interface.js';
