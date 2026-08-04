# todo42 — resolve a receiver by its declared parameter type
Status: todo

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

- [ ] Resolve a receiver that is not a node by reading the ENCLOSING function's parameter list: a parameter with a declared type states what the receiver is, exactly as `new Y()` does
- [ ] `dna.params` is not on the SHALLOW load, and shallow is the load analyze uses — the trap ADR 0084 and 0086 each paid for once. Either add the column or put params on the skeleton, and say which in the record
- [ ] Refuse an untyped parameter outright: `registry` with no annotation states nothing, and guessing from the name is how the vault filled with `results.foreach`

## Phase 2 — the `typeof` alias

- [ ] Resolve `type X = typeof y` to the variable `y`, so a parameter typed `Registry` reaches the object literal whose paths ADR 0094 already records
- [ ] Uniqueness-gate it and refuse a chain where any hop is ambiguous, per ADR 0085
- [ ] MEASURE on conducks and mentorseed: dangling, source-verified precision and orphan count together, per ADR 0077 — a count that improves while a rate worsens is a denominator being destroyed
