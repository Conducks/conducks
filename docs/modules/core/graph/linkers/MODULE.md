# core/graph/linkers — binding names to symbols across files

**Part of:** [core/graph](../MODULE.md). `import-resolver`, `linker`, `linker-intra`,
`linker-federated`, `http-service-linker`.

**Responsibility:** the second half of resolution. Parsing emits targets that are often just a bare
name (`ensureCollection`) or an unresolved specifier; the linkers bind those to real node IDs once
every file is known. `linker-intra` handles same-repo symbol references; `linker-federated` and
`http-service-linker` bind across repos and across service boundaries.

**Boundaries:** binding only — they never invent nodes or decide meaning. An unbindable reference is
left dangling on purpose; dead-code reads danglers as evidence of use rather than treating the target
as orphaned, which keeps it under-reporting.

**Deferred / not built:** dynamic dispatch, and one narrower case now carved out of it. A DI property
chain (`registry.evolution.watcher`) still cannot be resolved statically and is not attempted. But a
member call on a variable whose DECLARATION states its type — `const r = new ServiceRegistry()`, then
`r.get(...)` — IS resolved, because that is a read rather than an inference (ADR 0082). The line
between them is where the type is written: on the declaration it is read; returned from a factory
(`X.getInstance()`) it is not guessed. The consequence — a handful of permanent orphan false
positives — is still accepted rather than papered over with heuristics.

## Fuzzy matching is the risk, `sameFamily` is the guard

Resolution degrades gracefully: exact path, then extension inference, then index files, then a fuzzy
basename match. That last tier is what makes polyglot repos work, and it is also what will bind a
`.py` import to a same-named `.tsx` or `.go` file.

Every tier that can fuzzy-match is guarded by `sameFamily()`. This is not defensive decoration — the
confidence-1 resolution path produced the majority of false cross-language edges before the guard was
added. **A new resolution tier must apply it.**

## TS imports lie about their extension

TypeScript ESM writes `./x.js` for a file that is `x.ts`. The resolver tries the specifier as written
*and* with `.js` stripped, then extensions, then `/index.*`. Anything reimplementing resolution needs
both forms or every relative import in the codebase silently fails to bind.

## Self-imports are detected from the specifier, not the resolution

A file that re-exports from its own path (`export * from './self'`) is a degenerate stub, flagged as
ARCH-4. Detection keys strictly off the **specifier** resolving back to the same file — never off the
resolver's output, because the fuzzy tier matches a bare package name (`context`, `routing`) to a
same-named local file and would report a false self-import. The audit matches only the explicit
`self::` edge marker, never a generic unit → unit self-loop.
