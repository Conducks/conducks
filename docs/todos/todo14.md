# todo14 — type-position captures: close the recall gap in TYPE_REFERENCE
Status: todo
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
- [ ] probe + add the four type-position patterns to typescript/tsx queries (javascript has no type positions)
- [ ] canary asserts in the heritage or type-only suite: each position yields a TYPE_REFERENCE edge
- [ ] type-only-imports 4/4 unchanged; full suite green
## Phase 2
- [ ] un-exclude type-declaration targets in `findStaleImports` (`PRUNABLE_BINDING_KINDS`)
- [ ] re-run the tsc-subset validation on a fresh pulse; findings must remain a strict subset
- [ ] also worth fixing while there: `GraphTraversal.traverseUpstream(...)` static call emits no CALLS edge (`adjacency-list.ts:367`); the `.js` provider tie (memory.md) needs its decision
