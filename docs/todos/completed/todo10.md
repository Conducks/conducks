# todo10 — finish the type-aware governance pass (ADR 0016 + 0017)
Status: done
- Result: `conducks audit` on conducks is CLEAN — 0 circular dependencies, 0 hub overloads.
  Cross-checked against `madge`: on compiled JS both report 0. `madge` on TS *source* still reports
  3, which is the type-erasure blind spot ADR 0016 describes — conducks is the more accurate of the
  two here, and that is the claim to defend.
- Acceptance: `conducks audit` on conducks reports 0 circular dependencies and 0 hub overloads, or
  each remaining finding is confirmed genuine with evidence; cross-checked against `madge`.

## Phase 1 — ARCH-3 as a module import cycle (ADR 0017)
- Builds: 0017
- [x] Restrict the audit's cycle detection to import-level via `IMPORT_CYCLE_IGNORED_EDGE_TYPES`
      (containment + TYPE_REFERENCE + CALLS/CONSTRUCTS/ACCESSES); all four `detectCycles` call
      sites now share one definition
- [x] Regression tests: genuine import cycle → 1; mutual-call tangle with no import cycle → 0;
      type-only import cycle → 0
- [x] Suite counts were inflated by abandoned agent worktrees under `.claude/worktrees/` running
      duplicate stale copies — the `npm test` script's CLI `--testPathIgnorePatterns` silently
      overrode the config list. Real suite is 7 suites / 31 tests, not "49"
- [x] Cross-validate against `madge` per ADR 0010's bar — on compiled JS both report 0 cycles
- [x] ARCH-3 no longer fires on conducks (cleared by Phase 2, as diagnosed)

## Phase 2 — the real ARCH-3 blocker: binding misclassification
Two separate causes stop `algorithms/* → adjacency-list` imports from qualifying as type-only, which
is what actually keeps the cycle alive (`adjacency-list → cycle-detector` is a genuine runtime
import, so only the return direction can clear it):
- Builds: 0016
- [x] **Case collision.** Fixed by preserving the pre-lowercase name: producers now carry
      `metadata.original` (flow assignments, reference-as-value ACCESSES) and the import binding
      carries `bindingNameRaw`. The classifier matches case-sensitively and falls back to
      case-insensitive only for uses with no case-accurate spelling (stays conservative)
- [x] **No type evidence.** `ranker.ts:1` imported `ConducksNode` and never used it — a genuine
      unused import, removed. The conservative rule correctly refused to guess (covered by a test)
- [x] Re-measured: 267 of 1237 IMPORTS edges now type-only (was 213)
- [x] It does now, and finding out why it did not exposed a deeper bug. `findStaleImports` was already
      wired into `prune` and already allowed type kinds (`interface`, `enum`, widened by todo14) — but an
      unused import of a ONE-LINE class was never reported. Cause: `getScopeAt` resolved a declaration's
      scope from ROWS alone and excluded only its own NAME, so for
      `export class Widget { run(): void {} }` the class's own method shared the row, passed the test,
      and became the class's parent — id `::run.widget` instead of `::widget`. The import edge pointed at
      `::widget`, which no node had, so the binding could never be resolved and was silently skipped.
      Fixed by carrying columns in the scope map and excluding any scope the declaration CONTAINS.
      Verified on a fixture: the id is `::widget` with `::widget.run` under it, and prune reports both
      stale imports. Pinned by `tests/unit/core/languages/one-line-scope-chain.test.ts`

## Phase 3 — the registry hub: was never a real finding
- Builds: 0016
- [x] Measured after the Phase 2 fix: `::unit` 74 raw → **14** runtime fan-in, `::registry` 77 raw →
      **37**, both well under the limit of 50. The intermediate reading of 60 was a partially-fixed
      state, not a real number. The registry is a DI type contract that almost every CLI command
      imports for typing only — it was never runtime-overloaded
- [x] No split needed and no limit raised. Recorded here so the earlier "hub-overloaded, split the
      registry" recommendation is not acted on later — it was an artifact of counting type imports

## Phase 4 — deferred, not dropped (ADR 0017)
- Builds: 0017
- [x] Built as **ARCH-6**, a DISCOVERY rather than a violation, so it never fails an audit — mutual
      recursion is legal and only a human can tell it from a knot. Traverses `CALLS` and nothing else,
      via a new `onlyTypes` option on `detectCycles`: expressing "follow CALLS only" as an ignore-list
      means naming every other edge type and going stale the moment one is added. Self-recursion
      (length 1) is excluded. Unlike ARCH-3 it does NOT require the cycle to span files — a single-file
      knot is exactly what ARCH-3 refuses to look at. Measured on conducks: **2** tangles
      (`readFile -> readSingleFile`, `findNearestTsconfig -> resolve`) against 199 unfiltered cycles,
      so the signal is specific enough to act on. Rendered by `conducks audit`; pinned by
      `tests/unit/domain/governance/mutual-call-tangle.test.ts`
- [x] Other languages are type-blind: Python/Rust/Java/C# have no `pulse_type_target` capture, so
      `isTypeOnly` never fires for them. Either add the captures or document the limit per language.
      Captures ADDED for all four. `reflect` already had a language-agnostic
      `pulse_type_target -> TYPE_REFERENCE` branch (`reflector.ts:566`), so the whole fix was per
      language `queries.ts` — nothing outside `core/parsing` changed. Each is pinned by
      `tests/unit/core/languages/type-reference-<lang>.test.ts`, which compiles the query against the
      REAL installed grammar in a child process and asserts a NON-ZERO edge count: a query that
      matches nothing yields zero silently, which is how four earlier features shipped dead
      (CONDUCKS-13). Verified failable — disabling the captures turns 20 assertions red.
      Two grammar traps recorded in `memory.md`: Java's `scoped_type_identifier` recurses and Rust's
      does not, so Rust's blanket capture double-emits every package prefix if copied to Java; and
      Python cannot fully express PEP 604 chained unions.
