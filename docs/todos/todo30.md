# todo30 — a property chain over an object literal is not dynamic dispatch
Status: todo
- Acceptance: `container.services.registry.lookup()` resolves to `Registry.lookup`, the six registry orphan false positives are gone, and oracle T30/T31/T32 pass.

## Context

`core/graph/linkers/MODULE.md` records dynamic dispatch as deliberately unhandled and names
`registry.evolution.watcher` as its example. That example is **not dynamic dispatch**, and the
mislabel has kept it unexamined (ADR 0093 is the same story about the reflector).

```ts
get chronicle() { return chronicle; }                 // registry/index.ts
registry.infrastructure.chronicle.discoverFiles()     // the call site
```

Every hop is a property name written literally in the source. Nothing is computed. `handlers[key]()`
IS dynamic and is correctly refused — a computed key names no symbol — but these two shapes were
filed together and only the first deserves the label.

**Measured cost today:** six of conducks' seventeen remaining orphan findings are registry
properties reached this way, and they are the whole remaining false-positive population after
ADR 0092. The call edges dangle as well.

## Phase 0 — what the graph holds today, measured

- [x] MEASURED on the oracle's `container.ts` (traps T30–T32, expected answers committed before the run). The dangling target is `container.ts::container.services.registry.lookup` — the call processor resolves the object to its FILE and writes the whole property path, so the shape is fully preserved and simply unwalked
- [x] MEASURED which nodes exist: `container` (variable), `database` and `reg` (both carrying `instanceOf`), and `db` (the getter, kind=method). **`services`, `infrastructure` and `registry` do not exist as nodes** — nested object-literal properties are never captured
- [x] MEASURED which edges exist: `container` and `db` carry MEMBER_OF and NOTHING else. The `@ref_value` capture does not fire for `registry: reg` inside a nested literal, and a getter body returning a bare identifier is not linked to it
- [x] CONFIRMED the sibling case is correctly refused and needs no work: handlers registered in another file's dispatch table are NOT reported dead (oracle T29), because the reference-as-value ACCESSES edge already covers them

## Phase 1 — capture what the source states

- [ ] Emit a node for each nested object-literal property, so `container.services` and `container.services.registry` exist and the chain has something to walk
- [ ] Link a property whose value is a BARE IDENTIFIER to that identifier — `registry: reg` is an alias, the same relationship `export { x as y }` records. A property whose value is a call or an expression states no type and must record nothing
- [ ] Link a getter whose body is a single `return <identifier>` to that identifier — an alias in object form. A getter with any other body is not one and must be left alone
- [ ] Refuse a COMPUTED property (`[key]: fn`) outright — that is the `handlers[key]()` case and it belongs on the other side of the line

## Phase 2 — walk the chain

- [ ] Resolve `<file>::a.b.c.method` by walking each hop through the aliases above, reusing `declarationOf`/`memberOfType` rather than adding a parallel resolver
- [ ] Uniqueness-gate every hop, and refuse the whole chain if any hop is ambiguous — a partially-resolved chain that lands somewhere plausible is the wrong-edge failure ADR 0085 measured
- [ ] MEASURE on conducks and mentorseed: orphan count, dangling rate AND source-verified precision together, per ADR 0077

## Phase 3 — correct the record

- [ ] Rewrite the "dynamic dispatch" paragraph in `core/graph/linkers/MODULE.md` to separate a computed key (refused, correctly) from a literal property chain (resolved). The current wording is what hid this
