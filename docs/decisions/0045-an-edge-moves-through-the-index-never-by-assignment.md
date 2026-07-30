# 0045 — an edge moves through the index, never by assignment
Status: Accepted
- Enforced by: tests/unit/core/graph/neural-rebind-index.test.ts
- Date: 2026-07-30

## Context

`ConducksAdjacencyList` keeps two views of the same edges: the forward adjacency, and `inEdges`, a
backward index keyed by target. `rebindEdgeTarget` exists to keep them agreeing — it removes the edge
from the old target's in-set, moves `targetId`, and adds it to the new one. Its own doc comment says
it is "essential for neural binding where temporary IDs are resolved to origins".

`bindNeuralCircuits` — the binder that resolves a bare call target to a same-file symbol — did not
call it. It assigned:

```ts
edge.targetId = localId;
```

The edge then pointed at the right node and was still filed under the old one. `getNeighbors(new,
'upstream')` missed it; `getNeighbors(old, 'upstream')` still returned it.

The forward direction stayed correct, which is why nothing caught it: every test that checked the
rebind checked `edge.targetId`, and that assertion passes against the broken version. `impact` walks
upstream, so "who calls this symbol" lost precisely the edges this binder had just repaired.
`IntraLinker` performs the same operation correctly at `linker-intra.ts:141` — one codebase, one
operation, two call sites, one safe.

## Decision

**Edge target mutation goes through `rebindEdgeTarget`.** Nothing outside the adjacency list assigns
`edge.targetId`. The method that owns the invariant is the only thing allowed to break it.

**The test asserts the BACKWARD direction.** A test for a two-sided invariant that checks the side
which never broke is coverage, not enforcement. Both cases in the enforcing test were confirmed red
against a restored `edge.targetId = localId` before being accepted.

**Not chosen: rebuilding `inEdges` after `resonate()`.** A full rebuild would mask any future
assignment rather than prevent it, costs a pass over every edge, and leaves the invariant unowned —
the next binder to assign directly would still be wrong and still pass.

**Not chosen: making `targetId` readonly on the type.** It would catch this at compile time, which is
better, but `ConducksEdge` is constructed and mutated across the parsing lane and the persistence
reload, so the change is wide and this record does not carry it. Noted as the stronger fix if the
mistake recurs.

## Consequences

Upstream queries return more edges than before on any graph where neural binding fires — that is the
repair, but it means `impact` results widen for existing vaults only after a re-analyze, since the
index is rebuilt from rows at load time and the stale state was never persisted.

The wider risk this exposes is not fixed here: any code holding a `ConducksEdge` can still assign
`targetId`, and nothing detects it. This record makes the rule explicit and pins one call site with a
test. It does not make the rule enforceable by the compiler.

`Open:` whether the same split exists between the adjacency list and any other derived index. Only
`inEdges` was audited, because only it had a reported symptom. `lowerNameIndex` and `filePathIndex`
are maintained in `addNode`/`clearFile`/`clear` and have no equivalent mutation path, but that was
read, not tested. Carried by todo24#P3.
