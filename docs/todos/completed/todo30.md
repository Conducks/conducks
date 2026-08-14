# todo30 — a property chain over an object literal is not dynamic dispatch
Status: done
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

- [x] Emit a node for each nested object-literal property, so `container.services` and `container.services.registry` exist and the chain has something to walk
- [x] Link a property whose value is a BARE IDENTIFIER to that identifier — `registry: reg` is an alias, the same relationship `export { x as y }` records. A property whose value is a call or an expression states no type and must record nothing
- [x] Link a getter whose body is a single `return <identifier>` to that identifier — an alias in object form. A getter with any other body is not one and must be left alone
- [x] Refuse a COMPUTED property (`[key]: fn`) outright — that is the `handlers[key]()` case and it belongs on the other side of the line

## Phase 2 — walk the chain

- [x] Resolve `<file>::a.b.c.method` by walking each hop through the aliases above, reusing `declarationOf`/`memberOfType` rather than adding a parallel resolver
- [x] Uniqueness-gate every hop, and refuse the whole chain if any hop is ambiguous — a partially-resolved chain that lands somewhere plausible is the wrong-edge failure ADR 0085 measured
- [x] MEASURE on conducks and subject-b: orphan count, dangling rate AND source-verified precision together, per ADR 0077

## Phase 3 — correct the record

- [x] Rewrite the "dynamic dispatch" paragraph in `core/graph/linkers/MODULE.md` to separate a computed key (refused, correctly) from a literal property chain (resolved). The current wording is what hid this

## Outcome

Built as ONE capture, ONE column and ONE linker rule rather than the four pieces Phase 1 and 2
listed. The call processor already preserved the whole path
(`container.ts::container.services.registry.lookup`), so nothing had to be minted: the root variable
records which identifier each property PATH aliases, and the linker walks the longest path that
resolves, leaving the rest as the member. No new nodes, so `pruneTaxonomy` is untouched.

MEASURED. conducks: orphan findings **17 -> 13**, dangling **1.273% -> 1.148%**, source-verified
member calls **1,205 -> 1,227, still 100%**. subject-b: edges **20,518 -> 21,193**, dangling
**0.556% -> 0.505%**, source-verified **1,314 -> 1,365, still 100%**. More edges resolved AND every
one of them still correct is the strongest available evidence that a rule is real rather than fitted.

All six registry false positives are gone. The last one flagged in that file, `initializeRegistry`,
was checked against source and is a TRUE finding — nothing imports it.

Two getters needed a second pass. `get watcher() { return evolution.getWatcher(...); }` COMPUTES its
value rather than aliasing one, so no type can be read — but the property is demonstrably wired.
Those paths are now recorded with an EMPTY value: dead-code treats the name as reachable, and the
resolver refuses it. Wired and type-unstated are different facts and are stored as different values.
