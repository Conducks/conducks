# registry — the composition root

**Layer:** composition. Imports core + domain + contracts; imported by every interface. It is the
only place allowed to know about everything.

**Responsibility:** dependency injection and lifecycle. It constructs the persistence handle, the
graph, the analysis and governance services, and hands interfaces a single wired object. It owns
read-only vs read-write mode and teardown.

**Boundaries:** no logic. If a behaviour lives here rather than in a domain service, it is misplaced.

**Deferred / not built:** no splitting by domain. This was recommended once and is now explicitly
withdrawn — see below.

## It looks like a hub and is not

The audit flagged `src/registry/index.ts` at 74 and 77 upstream connections against a limit of 50, and
the obvious reading — "composition-root god object, split it by domain" — was wrong. Measured after
type-only imports were excluded: **74 raw → 14 runtime, 77 → 37**, both well under the limit.

38 of its 50 importers are CLI commands, and every one of the 38 imports the registry purely to *type*
its handler, so the compiler erases all of them. The registry is a DI type contract, not a runtime
hub. Do not split it on
fan-in evidence, and be suspicious of any future coupling metric here that has not excluded type
imports (ADR 0016).

## The vault hold lives here, with the object it protects

`acquireVault` / `releaseVault` ref-count who is reading the shared DuckDB handle; it closes only when
the last holder releases. That count sits on the registry rather than in the MCP layer because a single
tool call passed through THREE independent closers — `hypertoon`'s wrapper, the handler's own
`ensureAnchor`/`releaseAnchor` pair, and `tool-registry`'s `finally`, which closed outright and ignored
the count. With two calls in flight, whichever finished first hung up on the other (todo52, ADR 0147).

It could not stay in `interfaces/tools/shared/anchor.ts`: composition would have to import the MCP layer
to reach it, and `boundaries.test.ts` refuses that edge — correctly, since a vault hold is an
infrastructure concern and MCP is one of its callers.

`changeSet`/`impactedSymbols` and `governedCount` are exposed here for the same reason: the CLI must not
import the domain directly, so a fact both surfaces need is reached through the registry.

## Dynamic access is invisible to static analysis

Services are reached through property chains (`registry.evolution.watcher`), so the getters have no
incoming edge in the graph and dead-code reports them as orphans. Four of them are permanent, known
false positives. This is the price of the DI shape and is accepted; do not "fix" it by deleting a
getter, and do not add a special case to dead-code for it.
