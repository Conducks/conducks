# todo34 — a receiver that is a typed PARAMETER
Status: todo
- Acceptance: `registry.infrastructure.graphEngine.getGraph()` inside a CLI command resolves, and conducks' deep-chain dangling bucket falls from 113.

## Context

113 of conducks' 198 dangling edges are one shape: `registry.<a>.<b>.<method>` inside a CLI command.
It is the largest remaining bucket by a wide margin, and every hop is written in the source.

ADR 0094 taught the linker to walk a property chain over an object literal. That fix cannot START
here, because the receiver is not a variable:

```ts
execute(args: string[], registry: Registry): Promise<void>   // command.ts
export type Registry = typeof registry;                       // registry/index.ts
```

The receiver is a PARAMETER with a declared type, and the type is a `typeof` alias to the object
literal the chain needs. Both facts are written down; neither is modelled.

## Phase 0 — measured, and one piece already shipped

- [x] MEASURED: 113 edges / 63 targets on conducks — `registry.infrastructure.graphengine.getgraph`,
      `registry.audit.status`, `registry.infrastructure.chronicle.getprojectdir`. On mentorseed the
      same bucket is ONE edge, so this is a shape a composition root produces and an app does not
- [x] SHIPPED: a getter's LAST return now counts, not only a single-statement body. A getter that
      guards or comments before returning a binding is still an alias, and requiring one statement
      recorded nothing for most of a real DI container. `registry`'s recorded paths went from 8 to 10
      naming an identifier, including `infrastructure.graphengine=graph`
- [x] The remaining 63 paths on `registry` name no identifier and correctly record an EMPTY value —
      they return calls or expressions, which state no binding

## Phase 1 — the parameter's declared type

- [ ] Resolve a receiver that is not a node by reading the ENCLOSING function's parameter list: a
      parameter with a declared type states what the receiver is, exactly as `new Y()` does
- [ ] `dna.params` is not on the SHALLOW load, and shallow is the load analyze uses — the same trap
      ADR 0084 and 0086 each paid for once. Either add the column or put params on the skeleton, and
      say which in the record
- [ ] Refuse an untyped parameter outright. `registry` with no annotation states nothing

## Phase 2 — the `typeof` alias

- [ ] Resolve `type X = typeof y` to the variable `y`, so a parameter typed `Registry` reaches the
      object literal whose paths ADR 0094 already records
- [ ] Uniqueness-gate it and refuse a chain where any hop is ambiguous, per ADR 0085
- [ ] MEASURE on conducks and mentorseed: dangling, source-verified precision and orphan count
      together, per ADR 0077 — a count that improves while a rate worsens is a denominator being
      destroyed
