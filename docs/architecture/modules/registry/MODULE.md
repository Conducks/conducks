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

The audit flagged `registry/index.ts` at 74 and 77 upstream connections against a limit of 50, and
the obvious reading — "composition-root god object, split it by domain" — was wrong. Measured after
type-only imports were excluded: **74 raw → 14 runtime, 77 → 37**, both well under the limit.

41 of 50 importers are CLI commands that import the registry purely to *type* their handler; the
compiler erases every one. The registry is a DI type contract, not a runtime hub. Do not split it on
fan-in evidence, and be suspicious of any future coupling metric here that has not excluded type
imports (ADR 0016).

## Dynamic access is invisible to static analysis

Services are reached through property chains (`registry.evolution.watcher`), so the getters have no
incoming edge in the graph and dead-code reports them as orphans. Four of them are permanent, known
false positives. This is the price of the DI shape and is accepted; do not "fix" it by deleting a
getter, and do not add a special case to dead-code for it.
