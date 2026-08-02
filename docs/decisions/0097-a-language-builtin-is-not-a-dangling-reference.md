# 0097 — a language built-in is not a dangling reference
Status: Accepted
- Date: 2026-08-02
- Builds: 0096
- Enforced by: the honest dangling rate itself — `analyze` prints both counts, and a built-in that regresses shows up as a bare-name dangler

## Context

ADR 0096 stopped `analyze` deleting its own failures, which made the real backlog visible for the
first time: **1,311 unresolved references on conducks, 7.10%**, against the 1.15% previously reported.

Classifying that backlog rather than assuming it: **1,197 of 1,311 (91%) were BARE names carrying no
file at all**, and the largest single entry was `Record` — 75 TYPE_REFERENCE edges.

`Record` is TypeScript's own utility type. `parseInt` and `parseFloat` are JavaScript globals. Neither
is declared by any project, so a reference to one leaves the codebase exactly the way `Date` does —
and `Date` was already in the global list while `Record` was not. The list had been written from
memory rather than from a measurement, so it covered the obvious globals and none of the rest.

## Decision

**A type or function the LANGUAGE declares resolves to its global id, not to nothing.**

Added to `GLOBAL_ATMOSPHERE`: TypeScript's utility types (`Record`, `Partial`, `Pick`, `Omit`,
`ReturnType`, `Awaited`, …), the lib types a real codebase names (`ReadonlySet`, `RegExpExecArray`,
`BufferEncoding`, `Iterable`, typed arrays), and the JavaScript globals that were missing
(`parseInt`, `parseFloat`, `URL`, `URLSearchParams`, `TextEncoder`, `AbortController`, `Buffer`,
`Symbol`, `structuredClone`, …).

**And a BUILT-IN receiver resolves to its global id.** `const seen = new Set()` then `seen.has(x)`
is a Set method: the type is already recorded on the variable (ADR 0082), it simply has no project
FILE, and `memberOfType` demanded one. 348 edges on this repository dangled with the answer sitting
on the receiver.

## Consequences

- MEASURED in two steps. Adding the language's own names: conducks **7.10% → 6.28%**, mentorseed
  **10.77% → 8.86%**. Then resolving built-in receivers: conducks **→ 4.69%**, mentorseed
  **→ 8.46%**. Both graphs LARGER
  (18,503 and 24,641 edges). Source-verified precision unchanged at **99.98%**, 1,284 tests green.
- **The remaining backlog is now nearly all one shape**, and it is the shape this project decided to
  keep visible: a method call on a local whose type is unknown — `seen.has`, `visited.add`,
  `args.find`, `graph.getAllNodes`. `get`, `set`, `has`, `add` and `delete` are deliberately NOT in
  the universal-member list (ADR 0096) because they are Map/Set methods AND common service method
  names, so those edges dangle rather than being deleted on a guess.
- 18 edges point at `T`, a generic type PARAMETER. A type parameter is declared by the signature it
  appears in and references nothing, so emitting an edge for one is wrong at the source. Small and
  recorded rather than fixed here.
- **This is the second list in this codebase written from memory and corrected by measurement**, after
  the entry-point names in `prune`. A hand-written list of "the obvious cases" is a hypothesis; the
  backlog it leaves behind is the test.
