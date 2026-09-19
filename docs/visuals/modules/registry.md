# registry — the composition root

**Layer:** composition. Imports core + domain + contracts; imported by every interface. It is the
only place allowed to know about everything.

**Responsibility:** dependency injection and lifecycle. It constructs the persistence handle, the
graph, the analysis and governance services, and hands interfaces a single wired object. It owns
read-only vs read-write mode and teardown.

**Boundaries:** no logic. If a behaviour lives here rather than in a domain service, it is misplaced.

**No circular imports across `core/` and `registry/`.** The rule as originally written names both
trees together, and the incident it exists for was a door-to-door cycle between `core/graph` and
`core/parsing` (`core/graph/index.ts:8-14`) — TypeScript compiled it fine because no single FILE
closed the loop, only the two doors together did. The claimed enforcement was the general cycle
detector (`domain/governance/advisor.ts`); it is the mechanism that actually MISSED this class of
bug, because the closing leg was a type-only import the detector ignores by design. What actually
catches a door-to-door cycle today is `tests/architecture/feature-doors.test.ts` (a feature reached
past another's door) together with `tests/architecture/boundaries.test.ts` (the layer contract). The
fix for the original incident was structural, not a gate: shared types moved to `contracts/` so
neither door needed the other.

**Deferred / not built:** no splitting by domain. This was recommended once and is now explicitly
withdrawn — see below.

**Uses:** takes concrete constructors from core, domain and contracts and wires them into one object
— the persistence handle, the graph, and the analysis/governance services — then hands that single
wired object to whichever interface (CLI or MCP) asked for it. It also holds the vault ref-count
(below) so multiple callers can safely share one open handle.

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

Services are reached through property chains (`registry.evolution.watcher`). For most of this
module's life those getters had no incoming edge, dead-code reported four of them as orphans, and
this note said to accept it as the price of the DI shape.

**That is no longer true, and it was fixed in the parser rather than special-cased here.** Adding
value-position captures for member expressions (ADR 0165) made a bare property read a USE, so the
chain now binds: `conducks context src/registry/index.ts::evolution` returns three incoming
`accesses` edges, and prune reports zero registry orphans (measured 2026-08-29). The standing advice
survives its own premise — still do not delete a getter to quiet a tool, and still do not add a
special case to dead-code. The right fix for a false positive was to teach the graph what a use
looks like.

## Features
none — one file, `src/registry/index.ts`, composing everything else rather than offering its own
capability.

## Glossary
- **composition root** — the one place allowed to construct concrete instances of core/domain
  services and hand them to interfaces; every other layer receives, never constructs.
- **vault hold** — `acquireVault`/`releaseVault`'s ref-count on the shared DuckDB handle; it closes
  only when the last holder releases.
