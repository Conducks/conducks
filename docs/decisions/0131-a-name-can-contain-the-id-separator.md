# 0131 — a name can contain the id separator

Status: Accepted
- Date: 2026-08-04
- Builds: 0050, 0129, 0130
- Enforced by: tests/integration/features/route-single-node.test.ts (a route lives on one node; impact names its REQUEST), tests/integration/features/external-restamp.test.ts (an unreferenced external symbol leaves the vault), tests/unit/domain/kinetic/impact-containment.test.ts (case A now LIVE, not skipped) — every one run against the unfixed build first and failed

## Context

todo38's root cause, found and closed. Three defects formed one chain:

**1 — ingest assumed a target with `::` was an id** (`graph-engine.ts`). Synthesised nodes are NAMED
with the separator in the name — `ROUTE::/users/profile::GET` — so the edge from the defining scope
kept the bare string instead of resolving to the file-scoped node. Third site with this exact
assumption, after `resolveSymbol`'s two (ADR 0130).

**2 — external induction read the unresolved leftover as a library.** `route::/users/profile::get`
split on `::` gives namespace `route`, which is not a path, so induction minted `lib::route` and a
fake `library_symbol` — the duplicate that split every route's edges across two nodes.

**3 — the re-stamp made the fakes immortal.** ADR 0050's re-stamp exists for "virtual nodes this
pulse STILL DEPENDS ON", but the implementation re-stamped every `external://` node unconditionally.
Measured: 8 fake route/request libraries survived two consecutive `analyze --force` runs with zero
edges pointing at them. The same immortality applied to legitimate externals whose last reference was
deleted — the supply-chain surface only ever grew.

## Decision

**Ingest tries the file-scoped candidate for a `::` target too**, under a double guard: the target
does not resolve as it stands, and the candidate does. A real cross-file id is an absolute path, so
prefixing it with another file's path can never name a node — no edge that resolves today can change.

**The re-stamp enforces its own sentence.** A leaf external survives while some edge still targets
it; a container (`lib::` namespace, ecosystem root) survives while a surviving node still names it as
parent, followed to a fixpoint. Containers are never edge targets — the fact that broke the first
edge-walking version (ADR 0050) — which is why the parent chain is the mechanism.

**The ADR 0129 traversal rule ships**: `MEMBER_OF` is not followed upstream. Proven correct in 0129,
blocked until the duplicates were gone, live now — with its test un-skipped.

## Consequences

- On the hand-derived fixture, `impact format upstream` is exactly right: `fetchUser@1, service.ts@2,
  main@2, main.ts@3` — the phantom sibling is gone.
- On the cross-service fixture the answer is BETTER than it ever was: `REQUEST@1` and `loadProfile@2`
  — the actual calling function, whose edge had always pointed at the bare duplicate.
- conducks's own vault: 8 fake libraries → 0; supply chain unchanged (15 stdlib, 16 dependency);
  precision 99.98%; **1,447 tests green, zero skipped** — the CONDUCKS-36 skip is retired.
- `cross-service.test.ts` now passes for the RIGHT reason. It passed before because resolution landed
  on a duplicate and reached the REQUEST through container hops — a correct verdict standing on two
  defects that cancelled out. That is the sharpest lesson here: a green test can be load-bearing on
  the very bug it would otherwise catch.
- todo38#P2 stays open and is now the only remainder: whether a DOWNSTREAM trace should climb the
  containment ladder above UNIT (`trace`/`context` still do). Following containment forward is a
  defensible claim; how far is a design decision, not a defect fix.
