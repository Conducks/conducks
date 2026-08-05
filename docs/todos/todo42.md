# todo42 — resolve a receiver by its declared parameter type
Status: doing

- Acceptance: a call on a receiver that is a TYPED PARAMETER resolves to the type's declaration, an UNTYPED parameter is refused outright, and conducks' deep-chain dangling bucket falls below 59 — measured on conducks and mentorseed together with precision and orphan count, per ADR 0077.
- Depends: none

## Context

Extracted from todo34, which reached its acceptance by a different route — `new Y()` instantiation
tracking took conducks' deep chains from **113 to 59** and honest dangling from **7.350% to 7.095%**.
Its Phases 2 and 3 were the ORIGINAL plan for the same problem and were never built. They sat under
`Status: done` as six unchecked boxes, which is the state CONDUCKS-36 exists to prevent: work that is
neither owed nor dropped, invisible on the board.

They are still worth building — a typed parameter states what a receiver is exactly as `new Y()`
does — so they move here rather than being dropped.

## Phase 1 — the parameter's declared type

- [x] Resolved (linker-intra 3b-quater): a bare `recv.member` whose receiver has no node reads the enclosing function's `paramTypes` — the map the three-segment chain (todo36) had read all along, never consulted for the plain two-segment shape. Measured on the frozen subjects: orchestrator dangling 1,938 -> 1,887, sofie 3,361 -> 3,150, and sofie's CALLS precision is 100.0% (0 wrong of 7,156 source-checked) with 324 more edges checkable
- [x] `paramTypes` is its own column and IS on the load both linker passes read — proven by the fixture resolving through a vault-shaped graph, and by the dangling fall on real subjects; no new column needed
- [x] The typed-parameter path refuses an untyped or unresolvable type outright (fixture-proven). The OLDER import-scoped method-name match (3c) still binds within import scope — pre-existing behaviour with its own rail, not relitigated here

## Phase 2 — the `typeof` alias

- [ ] Resolve `type X = typeof y` to the variable `y`, so a parameter typed `Registry` reaches the object literal whose paths ADR 0094 already records
- [ ] Uniqueness-gate it and refuse a chain where any hop is ambiguous, per ADR 0085
- [ ] MEASURE on conducks and mentorseed: dangling, source-verified precision and orphan count together, per ADR 0077 — a count that improves while a rate worsens is a denominator being destroyed
