# core/graph/linkers — binding names to symbols across files

**Part of:** [core/graph](../graph.md). `core/graph/import-resolver.ts`, `core/graph/linker.ts`,
`core/graph/linker-intra.ts`, `core/graph/linker-federated.ts`, `core/graph/http-service-linker.ts`.

**Responsibility:** the second half of resolution. Parsing emits targets that are often just a bare
name (`ensureCollection`) or an unresolved specifier; the linkers bind those to real node IDs once
every file is known. `linker-intra` handles same-repo symbol references; `linker-federated` and
`http-service-linker` bind across repos and across service boundaries.

**Boundaries:** binding only — they never invent nodes or decide meaning. An unbindable reference is
left dangling on purpose; dead-code reads danglers as evidence of use rather than treating the target
as orphaned, which keeps it under-reporting.

**Deferred / not built:** dynamic dispatch, meaning a COMPUTED key — `handlers[key]()` names no
symbol at parse time and is refused. It is verified rather than assumed: handlers registered in
another file's dispatch table are NOT reported dead, because reference-as-value covers them.

This used to say `registry.evolution.watcher` was the same thing. **It is not** — every hop there is
a property name written literally, and the mislabel kept it unexamined for weeks. A property chain
over an object literal now resolves (todo30, ADR 0094): the root variable records which identifier
each path aliases, including a getter whose body returns one, and the linker walks it. A getter that
COMPUTES its value records the path with no type — wired, but unresolvable — which dead-code reads
and the resolver refuses.

## A dynamic import is a binding the call cannot see

a destructured `await import(...)` of a sibling module mints a module-level binding with an ALIASES edge — but a
dynamic import is normally written INSIDE a function, so the destructured name is also a
function-scoped local and the CALL lands on THAT. Two nodes for one fact, never meeting: the alias
hangs off a node nothing points at, the call points at a local that defines nothing, and the real
definition ends up with zero callers, which `prune` reports as dead code.

That module-level binding used to be never materialised — the ALIASES edge sat with a DANGLING
SOURCE, so a fix looking the source up with `getNode` never fired on the case it was written for.
`linker-intra` block 3b therefore derives the binding from the edge's own id (`<file>::<name>`) and
rebinds a same-file, same-name local to the aliased definition (todo58).

**todo62 changed that input.** The alias edge is now emitted against the id its node is actually
stored under, which for an import inside a function is SCOPED — so the dangling source is gone and 3b
skips scoped names by design. Instrumented, 3b logs no rebinds at all on a two-function fixture; what
it still carries has not been established, and starve experiments gave two OPPOSITE answers before
one of them turned out to be a contaminated run.

**And the rebind runs the other way too, as block 3c (todo64).** A local DECLARATION shadowing an
import of the same name must win: `context.localBindings` is keyed by name per FILE with no scope, so
`import { realTarget as shadowed }` made every `shadowed()` in the file resolve to the import. 3c
rebinds such a call to `<file>::<scope>.<name>` when that node exists — decided by existence, with two
guards that measurement forced. The names are compared CASE-SENSITIVELY, because ids are lowercased
(CONDUCKS-4) and `pathlib::Path` against a local `path` is one id — matching on the id alone rebound
37 python edges wrongly. And a node carrying an outgoing ALIASES edge is skipped, because a
destructured import binding IS the import rather than a declaration shadowing one.

## Linking runs TWICE, because induction creates nodes the first pass cannot see

`IntraLinker` runs before virtual/external induction, and again after it. On a warm vault the induced
nodes survive from the previous pulse so the first pass finds them; on a COLD vault they do not exist
yet and every reference landing on one dangles until the next analyze — which made a user's FIRST
analyze measurably worse than a rebuild of the same code.

Measured on the sofie subject: cold resolved 7,531 references against warm's 7,994, dangling 3,440
against 3,146. Replaying the linker alone over the cold vault — no re-parse, no re-induction —
recovered exactly the difference, which is what proved the cause before anything was changed (todo59).

It is a second PASS rather than a reorder: induction reads the dangling set that linking produces, so
inducting first would starve it.

## Fuzzy matching is the risk, `sameFamily` is the guard

Resolution degrades gracefully: exact path, then extension inference, then index files, then a fuzzy
basename match. That last tier is what makes polyglot repos work, and it is also what will bind a
`.py` import to a same-named `.tsx` or `.go` file.

Every tier that can fuzzy-match is guarded by `sameFamily()`. This is not defensive decoration — the
confidence-1 resolution path produced the majority of false cross-language edges before the guard was
added. **A new resolution tier must apply it.**

## TS imports lie about their extension

TypeScript ESM writes a ./x.js specifier for a file that is `x.ts`. The resolver tries the specifier as written
*and* with `.js` stripped, then extensions, then `/index.*`. Anything reimplementing resolution needs
both forms or every relative import in the codebase silently fails to bind.

## Self-imports are detected from the specifier, not the resolution

A file that re-exports from its own path (`export * from './self'`) is a degenerate stub, flagged as
ARCH-4. Detection keys strictly off the **specifier** resolving back to the same file — never off the
resolver's output, because the fuzzy tier matches a bare package name (`context`, `routing`) to a
same-named local file and would report a false self-import. The audit matches only the explicit
`self::` edge marker, never a generic unit → unit self-loop.
