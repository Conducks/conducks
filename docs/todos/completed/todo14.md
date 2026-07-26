# todo14 — type-position captures: close the recall gap in TYPE_REFERENCE
Status: done
- Promoted: docs/memory.md (the `#match?` unbound-capture trap; type-position captures); tests/unit/core/type-position-targets.test.ts
- Acceptance: `array_type`, `as_expression`, `type_predicate` and `union_type` positions emit `pulse_type_target` in typescript/tsx (probed patterns, canary-tested), the type-only-imports suite still passes byte-identically, STALE_IMPORT's tsc-subset validation is re-run — and with the new evidence, type-declaration targets can be un-excluded from `findStaleImports` (raising recall from 1 finding toward the measured ~23) while staying a strict subset of `tsc --noUnusedLocals`.

The STALE_IMPORT pass (2026-07-25) shipped deliberately under-reporting: 1 finding, 0 false
positives on conducks itself, vs tsc's 75 unused import bindings. Every residual false positive
traced to MISSING CAPTURES, not detector logic — measured, per class:

| hole | example | cost |
|---|---|---|
| `Foo[]` (`array_type`) | `ConducksCommand[]` at `cli/index.ts:97` | the whole 11-FP class that forced |
| `x as Foo[]` (`as_expression`) | `dead-code.ts:81` | excluding type targets entirely |
| `n is Foo` (`type_predicate`) | `search-engine.ts:66` | |
| `Foo \| null` (`union_type`) | common | |

Existing coverage: `(type_annotation (type_identifier))`, `(type_annotation (generic_type name:))`,
`(type_arguments (type_identifier))` only.

CAUTION — this touches ADR 0016 territory (what counts as a type-position use feeds `isTypeOnly`,
which feeds cycle/hub filtering). Probe every pattern (memory.md recipe; beware the `#match?`
unbound-capture trap), keep the type-only-imports suite green unchanged, and re-validate the stale
subset before un-excluding type targets.

## Phase 1
- [x] probe + add the four type-position patterns to typescript/tsx queries (javascript has no type positions)
- [x] canary asserts in the heritage or type-only suite: each position yields a TYPE_REFERENCE edge
- [x] type-only-imports 4/4 unchanged; full suite green
## Phase 2
- [x] un-exclude type-declaration targets in `findStaleImports` (`PRUNABLE_BINDING_KINDS`)
- [x] re-run the tsc-subset validation on a fresh pulse; findings must remain a strict subset
- [x] also worth fixing while there: `GraphTraversal.traverseUpstream(...)` static call emits no CALLS edge (`adjacency-list.ts:367`); the `.js` provider tie (memory.md) needs its decision

## Closed — 2026-07-25 (single-thread run, no subagents)

Phase 1: the four probed patterns landed in typescript+tsx (`array_type`, `as_expression`,
`type_predicate`, `union_type` — each captures only DIRECT type_identifier children; nesting
composes). Canary suite `tests/unit/core/type-position-targets.test.ts` (6 tests) pins every
position plus the isTypeOnly classification. type-only-imports stayed 4/4 unchanged.

Phase 2: widened `PRUNABLE_BINDING_KINDS` and re-validated. First pass: 23 findings, 4 false
positives — each a distinct capture gap, all probed and closed: generic CONSTRAINT position
(`<T extends A>`), generic-type NESTED in type_arguments (`Map<string, B<T>>`), local type
re-export as a value-use (`export type { C }` → @ref_value), and for-of right-side reads
(`for (const [k,v] of D)` → @ref_value — the bare-value-wiring hole). Final: **18 findings,
0 false positives**, strict subset of tsc's 75 named + 5 whole-line unused imports.

Also fixed en route: `isConstructor` typed every capitalized dotted call (Math.random, JSON.parse,
GraphTraversal.traverseUpstream) as CONSTRUCTS — a dotted name is never a constructor; and dotted
static calls now resolve via their object segment, so `GraphTraversal.traverseUpstream` finally
carries a CALLS edge (weighted distance 1.00 verified). The `.js`/`.jsx` provider tie is settled on
JavaScriptProvider in BOTH maps — JavaScriptProvider was never in the registry precedence list at
all (.js rode on the TS provider's claim); caught live when dispatch returned undefined, fixed
before it ever landed. Dead `extensionToGrammar` map and the dead reflector suffix-override deleted
with in-code tombstones; the LIVE Gnosis suffix heuristic at reflector.ts:~770 untouched.
